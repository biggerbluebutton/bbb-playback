# Speaker names in the transcript

The player's Transcript panel shows each line's time in bold, and the name
of whoever said it in bold. BigBlueButton's captions do not say who speaks,
so `speakers.py` adds the names on the server, from the recording itself:
BigBlueButton logs when each participant's microphone picks up speech, and
each caption line is given to whoever was talking during it.

Run it on the BigBlueButton server that records the meetings (the one with
`/var/bigbluebutton/recording/raw`):

```sh
sudo ./captions/speakers.py --check       # what it would do, changes nothing
sudo ./captions/speakers.py               # new recordings from now on, and every existing one
sudo ./captions/speakers.py <id>          # one recording
sudo ./captions/speakers.py --restore     # put the original captions back
sudo ./captions/speakers.py --uninstall   # stop naming new recordings
```

It:

- writes each speaker's name at the start of their caption lines, as a
  WebVTT voice tag (`<v Omar Ali>Welcome everyone`). The Transcript panel
  shows it in bold; the captions over the video and their translations show
  only the words;
- names the speakers in new recordings as each one is published (a
  post-publish script, `/usr/local/bigbluebutton/core/scripts/post_publish/caption_speakers.rb`),
  and in captions added after publishing, such as uploaded transcripts,
  every 15 minutes (`/etc/cron.d/bbb-caption-speakers`). Log:
  `/var/log/bigbluebutton/caption-speakers.log`;
- keeps the original caption files in `/var/bigbluebutton/caption-speakers`.
  `--restore` puts them back, except where the captions were replaced since;
- leaves alone captions that already name their speakers, so it can run
  again at any time.

It needs only Python 3, which BigBlueButton servers have. A three-hour
meeting takes about a second.

Good to know:

- Names are the ones participants joined the meeting with; people who dial
  in by phone get their caller ID.
- A line gets a name only when someone was clearly heard during it, and the
  person who talked longest during it when several were. Lines where nobody
  was heard stay without a name. It relies on microphones: someone whose
  microphone picks up the room (laptop speakers, a shared room) can be
  named for what others said.
- It needs the raw recording (`/var/bigbluebutton/recording/raw/<id>/events.xml`).
  Recordings whose raw files were deleted are left as they are.
- Recordings moved to another server after publishing (Scalelite, for
  example): post-publish scripts run in alphabetical order, so
  `caption_speakers.rb` runs before `scalelite_post_publish.rb` and new
  recordings arrive there with names. For recordings already moved, run it
  on the server that recorded them and copy their `caption_*.vtt` files to
  the other server again.
