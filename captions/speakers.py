#!/usr/bin/env python3
# Names the speakers in the captions of presentation recordings, so that the
# player's Transcript panel shows who said each line, in bold.
#
# BigBlueButton's captions do not say who speaks, but the recording logs when
# each participant's microphone picks up speech. For each caption line this
# finds who was talking at that moment and writes their name into the caption
# file as a WebVTT voice tag (<v Name>), which the player shows in bold.
#
# Run it as root on the server that records the meetings, where the raw
# recordings are (/var/bigbluebutton/recording/raw):
#
#   sudo ./captions/speakers.py                  name the speakers in new
#                                                recordings from now on, and
#                                                in every existing recording
#   sudo ./captions/speakers.py <recording id>   one recording
#   sudo ./captions/speakers.py --check [<id>]   only show what would be done
#   sudo ./captions/speakers.py --restore [<id>] put the original captions back
#   sudo ./captions/speakers.py --uninstall      stop naming new recordings
#
# Captions that already name their speakers are left alone, so it can run
# again at any time. The original caption files are kept in
# /var/bigbluebutton/caption-speakers.

import argparse
import bisect
import hashlib
import os
import pwd
import re
import shutil
import sys
import tempfile
import time
import xml.etree.ElementTree as ElementTree

PUBLISHED = os.environ.get('BBB_PUBLISHED', '/var/bigbluebutton/published/presentation')
RAW = os.environ.get('BBB_RAW', '/var/bigbluebutton/recording/raw')
EVENTS = os.environ.get('BBB_EVENTS', '/var/bigbluebutton/events')
BACKUP = os.environ.get('BBB_CAPTION_SPEAKERS_BACKUP', '/var/bigbluebutton/caption-speakers')
POST_PUBLISH = os.environ.get('BBB_POST_PUBLISH', '/usr/local/bigbluebutton/core/scripts/post_publish')
BIN = os.environ.get('BBB_CAPTION_SPEAKERS_BIN', '/usr/local/bin/bbb-caption-speakers')
CRON = os.environ.get('BBB_CAPTION_SPEAKERS_CRON', '/etc/cron.d/bbb-caption-speakers')
LOG = os.environ.get('BBB_CAPTION_SPEAKERS_LOG', '/var/log/bigbluebutton/caption-speakers.log')
USER = os.environ.get('BBB_USER', 'bigbluebutton')

HOOK = os.path.join(POST_PUBLISH, 'caption_speakers.rb')

# Captions whose files changed this recently are looked at by the cron job,
# which catches captions added after a recording was published
RECENT_DAYS = 2

# Seconds of leeway around each caption line: the microphone and the caption
# timings are not exactly in step
PAD = 0.25

# A line is given to whoever talked longest during it, if that is long
# enough: a fifth of the line, between 0.1 and 0.5 seconds
SHARE = 0.2
MIN_TALK = 0.1
MAX_TALK = 0.5

TIMING = re.compile(r'^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})')
VOICE = re.compile(r'<v[\s.]')
# Names written out at the start of a line ("Bob: Hello", "- Bob: Hello"),
# which some captions have instead of voice tags
WRITTEN_NAME = re.compile(r'^[-–—>»•\s]*[^:：\s][^:：\n]{0,39}(?::\s|：)')
# Captions are taken as naming their speakers when this share of their
# lines starts with a name
WRITTEN_SHARE = 0.3
# Names as older BigBlueButton versions log them: <user id>[_<session>]-bbbID-[LISTENONLY-]<name>
CALLER = re.compile(r'^.*?-bbbID-(?:LISTENONLY-)?(.*)$', re.DOTALL)
RECORDING_ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]*$')

QUIET = False


def say(message, always=False):
    if QUIET and not always:
        return
    prefix = time.strftime('%Y-%m-%d %H:%M:%S ') if QUIET else ''
    print(prefix + message, flush=True)


def fail(message):
    print(message, file=sys.stderr, flush=True)
    sys.exit(1)


# Recording events

def local_name(tag):
    return tag.rsplit('}', 1)[-1]


def child_text(element, name):
    for child in element:
        if local_name(child.tag).lower() == name.lower():
            return (child.text or '').strip()
    return ''


def clean_name(name):
    match = CALLER.match(name or '')
    name = match.group(1) if match else (name or '')
    return ' '.join(name.split())


def read_events(path):
    """When the recording was on and when each participant talked, as
    logged in events.xml: ([(start, stop)], [(name, start, stop)]), in
    milliseconds of meeting time"""
    first = None
    last = None
    marks = []
    users = {}
    names = {}
    open_talk = {}
    talks = []
    root = None

    def stop_talking(participant, timestamp):
        started = open_talk.pop(participant, None)
        if started and started[1] and timestamp > started[0]:
            talks.append((started[1], started[0], timestamp))

    for event, element in ElementTree.iterparse(path, events=('start', 'end')):
        if root is None:
            root = element
        if event != 'end' or local_name(element.tag) != 'event':
            continue

        try:
            timestamp = int(element.get('timestamp'))
        except (TypeError, ValueError):
            timestamp = None

        if timestamp is not None:
            if first is None:
                first = timestamp
            last = timestamp

            module = element.get('module')
            kind = element.get('eventname')

            if kind == 'RecordStatusEvent':
                marks.append(timestamp)
            elif module == 'PARTICIPANT' and kind == 'ParticipantJoinEvent':
                user = child_text(element, 'userId')
                name = clean_name(child_text(element, 'name'))
                if user and name:
                    users[user] = name
            elif module == 'VOICE' and kind == 'ParticipantJoinedEvent':
                participant = child_text(element, 'participant')
                # The name the participant joined the meeting with, otherwise
                # the one their audio connection carries
                names[participant] = users.get(participant) or clean_name(child_text(element, 'callername'))
                if child_text(element, 'talking') == 'true' and participant not in open_talk:
                    open_talk[participant] = (timestamp, names[participant])
            elif module == 'VOICE' and kind == 'ParticipantTalkingEvent':
                participant = child_text(element, 'participant')
                if child_text(element, 'talking') == 'true':
                    if participant not in open_talk:
                        name = names.get(participant) or users.get(participant)
                        open_talk[participant] = (timestamp, name)
                else:
                    stop_talking(participant, timestamp)
            elif module == 'VOICE' and kind in ('ParticipantLeftEvent', 'ParticipantMutedEvent'):
                if kind == 'ParticipantLeftEvent' or child_text(element, 'muted') == 'true':
                    stop_talking(child_text(element, 'participant'), timestamp)

        # Events are read one at a time: long meetings log a lot
        root.clear()

    if first is None:
        return [], []

    for participant in list(open_talk):
        stop_talking(participant, last)

    return recorded_segments(marks, first, last), talks


def recorded_segments(marks, first, last):
    """The parts of the meeting that were recorded, paired the way
    BigBlueButton's publish scripts pair them"""
    marks = sorted(marks)
    if not marks:
        marks = [first]
    if len(marks) % 2:
        marks = sorted(marks + [last])

    return list(zip(marks[0::2], marks[1::2]))


def to_playback(segments, talks):
    """Talking turned into seconds of the recording: the parts of the
    meeting that were not recorded are cut out, as in the playback"""
    playback = []
    elapsed = 0
    for start, stop in segments:
        for name, begin, end in talks:
            low = max(begin, start)
            high = min(end, stop)
            if high > low:
                playback.append((name, (low - start + elapsed) / 1000.0, (high - start + elapsed) / 1000.0))
        elapsed += stop - start

    return sorted(playback, key=lambda talk: talk[1])


class Talking:
    """Who talked when, in seconds of the recording"""

    def __init__(self, talks):
        self.talks = talks
        self.starts = [talk[1] for talk in talks]
        self.longest = max((talk[2] - talk[1] for talk in talks), default=0)

    def speaker(self, start, end):
        """Whoever talked longest during a caption line, if long enough"""
        low = start - PAD
        high = end + PAD
        totals = {}
        index = bisect.bisect_left(self.starts, high) - 1
        while index >= 0 and self.talks[index][1] >= low - self.longest:
            name, begin, stop = self.talks[index]
            overlap = min(stop, high) - max(begin, low)
            if overlap > 0:
                totals[name] = totals.get(name, 0) + overlap
            index -= 1

        if not totals:
            return None

        name, total = sorted(totals.items(), key=lambda item: (-item[1], item[0]))[0]
        needed = max(MIN_TALK, min(MAX_TALK, SHARE * (end - start)))

        return name if total >= needed else None


# Caption files

def seconds(value):
    total = 0.0
    for part in value.replace(',', '.').split(':'):
        total = total * 60 + float(part)
    return total


def voice_name(name):
    return name.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def name_speakers(text, talking):
    """The caption file with a <v Name> tag on each line someone was heard
    saying: (text, lines, named lines, names)"""
    newline = '\r\n' if '\r\n' in text else '\n'
    lines = text.replace('\r\n', '\n').split('\n')
    output = []
    cues = 0
    named = 0
    names = set()
    index = 0

    while index < len(lines):
        line = lines[index]
        match = TIMING.match(line)
        output.append(line)
        index += 1
        if not match:
            continue

        cues += 1
        payload = []
        while index < len(lines) and lines[index] != '':
            payload.append(lines[index])
            index += 1

        name = talking.speaker(seconds(match.group(1)), seconds(match.group(2))) if payload else None
        if name:
            payload[0] = '<v {}>{}'.format(voice_name(name), payload[0])
            named += 1
            names.add(name)

        output.extend(payload)

    return newline.join(output), cues, named, names


def names_written_out(text):
    """Whether the captions already write their speakers' names at the start
    of their lines, which another name in front would repeat"""
    lines = text.replace('\r\n', '\n').split('\n')
    cues = 0
    written = 0
    for index, line in enumerate(lines[:-1]):
        if TIMING.match(line):
            cues += 1
            if WRITTEN_NAME.match(re.sub(r'<[^>]*>', '', lines[index + 1])):
                written += 1

    return written >= 2 and written >= WRITTEN_SHARE * cues


def fingerprint(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def owner_of(path):
    info = os.stat(path)
    return info.st_uid, info.st_gid


def give_to(path, owner):
    if os.geteuid() == 0 and owner:
        os.chown(path, *owner)


def write_file(path, text, like=None):
    """Writes the file in one go, keeping the permissions and owner of the
    file it replaces"""
    info = os.stat(like or path) if os.path.exists(like or path) else None
    folder = os.path.dirname(path) or '.'
    handle, temporary = tempfile.mkstemp(prefix='.{}.'.format(os.path.basename(path)), dir=folder)
    try:
        with os.fdopen(handle, 'w', encoding='utf-8', newline='') as output:
            output.write(text)
        if info:
            os.chmod(temporary, info.st_mode & 0o7777)
            give_to(temporary, (info.st_uid, info.st_gid))
        else:
            os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    except BaseException:
        if os.path.exists(temporary):
            os.unlink(temporary)
        raise


def read_file(path):
    with open(path, encoding='utf-8', newline='') as source:
        return source.read()


def make_folder(path, owner):
    if not os.path.isdir(path):
        os.makedirs(path)
        give_to(path, owner)


# Recordings

def caption_files(recording):
    folder = os.path.join(PUBLISHED, recording)
    if not os.path.isdir(folder):
        return []
    return sorted(
        os.path.join(folder, name) for name in os.listdir(folder)
        if name.startswith('caption_') and name.endswith('.vtt')
    )


def find_events(recording):
    for folder in (RAW, EVENTS, PUBLISHED):
        path = os.path.join(folder, recording, 'events.xml')
        if os.path.isfile(path):
            return path
    return None


def all_recordings():
    if not os.path.isdir(PUBLISHED):
        return []
    return sorted(name for name in os.listdir(PUBLISHED) if caption_files(name))


def recent_recordings():
    """Recordings whose captions changed since the last time this looked
    (within the last few days), so that each change is handled once"""
    stamp = os.path.join(BACKUP, '.recent')
    since = time.time() - RECENT_DAYS * 86400
    if os.path.exists(stamp):
        # The stamp is set before looking, so files changed while the last
        # run was going are newer than it
        since = max(since, os.path.getmtime(stamp))

    try:
        make_folder(BACKUP, None)
        with open(stamp, 'a'):
            pass
        os.utime(stamp, None)
    except OSError:
        pass

    return [
        recording for recording in all_recordings()
        if any(os.path.getmtime(path) >= since for path in caption_files(recording))
    ]


def label_recording(recording, check):
    files = caption_files(recording)
    if not files:
        say('{}: no captions'.format(recording))
        return

    pending = []
    for path in files:
        try:
            text = read_file(path)
        except (OSError, UnicodeDecodeError) as error:
            say('{} {}: cannot be read ({})'.format(recording, os.path.basename(path), error), always=True)
            continue
        if VOICE.search(text) or names_written_out(text):
            say('{} {}: already names its speakers'.format(recording, os.path.basename(path)))
        else:
            pending.append((path, text))

    if not pending:
        return

    events = find_events(recording)
    if not events:
        say('{}: no events.xml in {} (raw recording deleted?), speakers unknown'.format(
            recording, os.path.join(RAW, recording)), always=True)
        return

    try:
        segments, talks = read_events(events)
    except (OSError, ElementTree.ParseError) as error:
        say('{}: {} cannot be read ({})'.format(recording, events, error), always=True)
        return

    talking = Talking(to_playback(segments, talks))
    if not talking.talks:
        say('{}: nobody was heard talking while recording, captions left as they are'.format(recording), always=True)
        return

    for path, text in pending:
        file_name = os.path.basename(path)
        named_text, cues, named, names = name_speakers(text, talking)
        summary = '{} {}: {} {} of {} lines{}'.format(
            recording, file_name, 'would name' if check else 'named', named, cues,
            ' ({})'.format(', '.join(sorted(names))) if names else '')

        if check or named == 0:
            say(summary, always=not check and named == 0)
            continue

        owner = owner_of(path)
        folder = os.path.join(BACKUP, recording)
        try:
            make_folder(BACKUP, owner)
            make_folder(folder, owner)
            backup = os.path.join(folder, file_name)
            write_file(backup, text, like=path)
            write_file(backup + '.named', fingerprint(named_text) + '\n', like=path)
            write_file(path, named_text)
        except OSError as error:
            say('{} {}: cannot be changed ({})'.format(recording, file_name, error), always=True)
            continue

        say(summary, always=True)


def restore_recording(recording, check):
    folder = os.path.join(BACKUP, recording)
    if not os.path.isdir(folder):
        say('{}: nothing to restore'.format(recording))
        return

    for name in sorted(os.listdir(folder)):
        if not (name.startswith('caption_') and name.endswith('.vtt')):
            continue
        backup = os.path.join(folder, name)
        marker = backup + '.named'
        path = os.path.join(PUBLISHED, recording, name)

        try:
            current = read_file(path) if os.path.exists(path) else None
            named = read_file(marker).strip() if os.path.exists(marker) else None
        except (OSError, UnicodeDecodeError) as error:
            say('{} {}: cannot be read ({})'.format(recording, name, error), always=True)
            continue

        # Captions replaced since they were named are newer than the backup
        changed = current is None or fingerprint(current) != named
        if check:
            say('{} {}: {}'.format(recording, name, 'changed since, would be left as it is' if changed else 'would be restored'))
            continue

        if not changed:
            write_file(path, read_file(backup))
        for leftover in (backup, marker):
            if os.path.exists(leftover):
                os.unlink(leftover)
        say('{} {}: {}'.format(recording, name, 'changed since, left as it is' if changed else 'restored'), always=True)

    if not check and not os.listdir(folder):
        os.rmdir(folder)


# Installation

HOOK_SCRIPT = '''#!/usr/bin/ruby
# encoding: UTF-8

# Names the speakers in the captions of each published presentation
# recording. Installed by bbb-playback's captions/speakers.py; it never
# holds up publishing.

meeting_id = nil
playback_format = nil
args = ARGV.dup
until args.empty?
  arg = args.shift
  case arg
  when '-m', '--meeting-id' then meeting_id = args.shift
  when /\\A--meeting-id=(.+)\\z/ then meeting_id = Regexp.last_match(1)
  when '-f', '--format' then playback_format = args.shift
  when /\\A--format=(.+)\\z/ then playback_format = Regexp.last_match(1)
  end
end

if meeting_id && (playback_format.nil? || playback_format == 'presentation')
  begin
    system({BIN!r}, '--quiet', meeting_id, out: [{LOG!r}, 'a'], err: [{LOG!r}, 'a'])
  rescue StandardError
    nil
  end
end

exit 0
'''

CRON_SCRIPT = '''# Names the speakers in captions added to recordings after they were
# published. Installed by bbb-playback's captions/speakers.py
*/15 * * * * {USER} [ -x {BIN} ] && {BIN} --recent --quiet >> {LOG} 2>&1
'''


def need_root():
    if os.geteuid() != 0:
        fail('Run it as root: sudo {}'.format(' '.join(sys.argv)))


def install():
    need_root()
    if not os.path.isdir(POST_PUBLISH):
        fail('No BigBlueButton recording scripts in {}: run it on the server that records the meetings.'.format(POST_PUBLISH))

    try:
        user = pwd.getpwnam(USER)
        owner = (user.pw_uid, user.pw_gid)
    except KeyError:
        owner = None

    shutil.copyfile(os.path.abspath(__file__), BIN)
    os.chmod(BIN, 0o755)
    hook = HOOK_SCRIPT.replace('{BIN!r}', repr(BIN)).replace('{LOG!r}', repr(LOG))
    write_file(HOOK, hook)
    os.chmod(HOOK, 0o755)
    write_file(CRON, CRON_SCRIPT.format(USER=USER, BIN=BIN, LOG=LOG))
    os.chmod(CRON, 0o644)
    make_folder(BACKUP, owner)
    give_to(BACKUP, owner)
    if os.path.isdir(os.path.dirname(LOG)):
        if not os.path.exists(LOG):
            open(LOG, 'a').close()
        give_to(LOG, owner)

    say('New recordings: speakers are named as each one is published ({}),'.format(HOOK), always=True)
    say('and in captions added later, every 15 minutes ({}). Log: {}'.format(CRON, LOG), always=True)


def uninstall():
    need_root()
    for path in (HOOK, CRON, BIN):
        if os.path.exists(path):
            os.unlink(path)
            say('Removed {}'.format(path), always=True)
    say('New recordings are no longer changed. Captions already named stay as they are;', always=True)
    say('to put the originals back: sudo {} --restore'.format(os.path.abspath(__file__)), always=True)


def main():
    global QUIET

    parser = argparse.ArgumentParser(
        description='Names the speakers in the captions of presentation recordings, '
                    'from who was talking during each line.')
    parser.add_argument('recordings', nargs='*', metavar='recording id')
    parser.add_argument('--check', action='store_true', help='only show what would be done')
    parser.add_argument('--restore', action='store_true', help='put the original captions back')
    parser.add_argument('--uninstall', action='store_true', help='stop naming new recordings')
    parser.add_argument('--recent', action='store_true', help='recordings whose captions changed in the last {} days'.format(RECENT_DAYS))
    parser.add_argument('--quiet', action='store_true', help='only report changes and problems')
    args = parser.parse_args()
    QUIET = args.quiet

    for recording in args.recordings:
        if not RECORDING_ID.match(recording):
            fail('Not a recording id: {}'.format(recording))

    if args.uninstall:
        uninstall()
        return

    if not os.path.isdir(PUBLISHED):
        fail('No recordings in {}: run it on the server that stores them.'.format(PUBLISHED))

    if args.restore:
        if not args.check:
            need_root()
        targets = args.recordings or (sorted(os.listdir(BACKUP)) if os.path.isdir(BACKUP) else [])
        for recording in targets:
            restore_recording(recording, args.check)
        return

    if args.recordings:
        targets = args.recordings
    elif args.recent:
        targets = recent_recordings()
    else:
        if not args.check:
            install()
        targets = all_recordings()

    for recording in targets:
        label_recording(recording, args.check)


if __name__ == '__main__':
    main()
