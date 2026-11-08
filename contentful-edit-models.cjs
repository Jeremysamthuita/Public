/**
 * Edits your EXISTING Contentful models in place (no deleting of models).
 * Model IDs stay: event, ministry, leader, sermons. The website (normalize.js) reads these.
 *
 * Event     -> title, Date and time, Venue, Short description, Flyer / poster / image
 * Ministry  -> name, short description, image, when we meet, how to join, display order
 * Leader    -> full name, team (lcc / women / pastoral), role, photo, about / message, display order
 * Sermons   -> title, preacher, date, scripture, sermon files, thumbnail, video link, audio link
 *
 * WARNING: removing a field removes that field's saved values on existing entries.
 * Make a backup first (see instructions), then run:
 *   contentful space migration --space-id em08252vzuh6 --environment-id Church-Website contentful-edit-models.cjs
 */
const URL_RULE = [{ regexp: { pattern: '^https?://\\S+$' }, message: 'Must start with http:// or https://' }];

module.exports = function (migration) {
  /* ------------------------------ EVENT ------------------------------ */
  const ev = migration.editContentType('event');
  ['slug', 'category', 'endDate', 'allDay', 'mapLink', 'imageAlt', 'ministry',
   'buttonLabel', 'buttonUrl', 'showInTicker', 'description'].forEach((id) => ev.deleteField(id));

  ev.editField('title').name('Event title');
  ev.editField('startDate').name('Date and time').required(true);
  ev.editField('locationName').name('Venue').required(false);
  ev.editField('summary').name('Short description').required(true).validations([{ size: { max: 300 } }]);
  ev.editField('image').name('Flyer / poster / image');

  ev.changeFieldControl('startDate', 'builtin', 'datePicker', { format: 'timeZ', ampm: '12', helpText: 'Pick the date and the start time (East Africa Time).' });
  ev.changeFieldControl('locationName', 'builtin', 'singleLine', { helpText: 'e.g. Main Sanctuary' });
  ev.changeFieldControl('summary', 'builtin', 'multipleLine', { helpText: 'Shown on the event card (max 300 characters).' });
  ev.changeFieldControl('image', 'builtin', 'assetLinkEditor', { helpText: 'Upload the flyer, poster or a photo. Landscape (16:9) works best.' });

  /* ----------------------------- MINISTRY ---------------------------- */
  const mn = migration.editContentType('ministry');
  ['slug', 'category', 'imageAlt', 'meetingLocation', 'leaders', 'acceptingMembers',
   'contactEmail', 'contactPhone', 'description'].forEach((id) => mn.deleteField(id));

  mn.editField('name').name('Ministry name');
  mn.editField('tagline').name('Short description').required(true).validations([{ size: { max: 500 } }]);
  mn.editField('image').name('Image');
  mn.editField('meetingSchedule').name('When we meet');
  mn.editField('joiningInformation').name('How to join');
  mn.editField('displayOrder').name('Display order');

  mn.changeFieldControl('tagline', 'builtin', 'multipleLine', { helpText: 'What this ministry is about.' });
  mn.changeFieldControl('image', 'builtin', 'assetLinkEditor', { helpText: 'Optional. Landscape photo works best.' });
  mn.changeFieldControl('meetingSchedule', 'builtin', 'singleLine', { helpText: 'e.g. Fridays 6:00 PM. Optional.' });
  mn.changeFieldControl('joiningInformation', 'builtin', 'multipleLine', { helpText: 'Contact person or how to sign up. Optional.' });
  mn.changeFieldControl('displayOrder', 'builtin', 'numberEditor', { helpText: 'Lower numbers appear first.' });

  /* ------------------------------ LEADER ----------------------------- */
  const ld = migration.editContentType('leader');
  ['slug', 'group', 'isLead', 'email', 'message'].forEach((id) => ld.deleteField(id));

  ld.createField('team').name('Team').type('Symbol').required(true).validations([{ in: ['lcc', 'women', 'pastoral'] }]);

  ld.editField('fullName').name('Full name');
  ld.editField('role').name('Role / title');
  ld.editField('photo').name('Photo');
  ld.editField('bio').name('About / message').validations([{ size: { max: 3000 } }]);
  ld.editField('displayOrder').name('Display order');

  ld.changeFieldControl('team', 'builtin', 'dropdown', { helpText: 'lcc = LCC, women = Women Ministry, pastoral = Pastoral Team.' });
  ld.changeFieldControl('role', 'builtin', 'singleLine', { helpText: 'e.g. Chairman, Secretary, Senior Pastor. Optional.' });
  ld.changeFieldControl('photo', 'builtin', 'assetLinkEditor', { helpText: 'Optional. If empty, the card shows no photo.' });
  ld.changeFieldControl('bio', 'builtin', 'multipleLine', { helpText: 'Optional. A short bio, or the pastor welcome message.' });
  ld.changeFieldControl('displayOrder', 'builtin', 'numberEditor', { helpText: 'Lower numbers appear first (1, 2, 3...).' });

  /* ------------------------------ SERMONS ---------------------------- */
  const sm = migration.editContentType('sermons');
  sm.deleteField('thumbnailAlt');

  sm.editField('date').name('Sermon date');
  sm.editField('powerpoint')
    .name('Sermon files')
    .required(false)
    .validations([{ size: { max: 2 }, message: 'You can upload up to 2 files.' }])
    .items({
      type: 'Link',
      linkType: 'Asset',
      validations: [{
        linkMimetypeGroup: ['attachment', 'presentation', 'pdfdocument', 'richtext', 'plaintext', 'audio', 'video'],
        message: 'Upload a PDF, PowerPoint, Word, audio (mp3) or video file.',
      }],
    });

  sm.createField('scriptureReference').name('Scripture').type('Symbol').validations([{ size: { max: 120 } }]);
  sm.createField('videoUrl').name('Video link').type('Symbol').validations(URL_RULE);
  sm.createField('audioUrl').name('Audio (mp3) link').type('Symbol').validations(URL_RULE);

  sm.changeFieldControl('date', 'builtin', 'datePicker', { format: 'dateonly' });
  sm.changeFieldControl('powerpoint', 'builtin', 'assetLinksEditor', { helpText: 'Upload up to 2 files: PDF, PowerPoint, Word, mp3 or video.' });
  sm.changeFieldControl('thumbnail', 'builtin', 'assetLinkEditor', { helpText: 'Landscape (16:9) works best.' });
  sm.changeFieldControl('scriptureReference', 'builtin', 'singleLine', { helpText: 'e.g. John 3:16-21' });
  sm.changeFieldControl('videoUrl', 'builtin', 'singleLine', { helpText: 'Optional. A YouTube or Vimeo link. Shows a "Watch sermon" button.' });
  sm.changeFieldControl('audioUrl', 'builtin', 'singleLine', { helpText: 'Optional. A direct https link to an mp3. Shows an audio player.' });
};
