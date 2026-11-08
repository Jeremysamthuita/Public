/**
 * STEP 2 of 2: create the simple models using the exact IDs and field names the website code reads
 * (assets/js/content/normalize.js), and extend your existing "sermons" model.
 *
 *   upcomingEvent     -> Event card
 *   leadershipProfile -> LCC / Women / Pastoral leaders
 *   ministry          -> Ministries page
 *   sermons           -> existing model, edited (existing entries and field IDs kept)
 *
 *   contentful space migration --space-id em08252vzuh6 --environment-id Church-Website contentful-step2-build.cjs
 */
const URL_RULE = [{ regexp: { pattern: '^https?://\\S+$' }, message: 'Must start with http:// or https://' }];
const IMAGE_ONLY = [{ linkMimetypeGroup: ['image'] }];

module.exports = function (migration) {
  /* ------------------------------ EVENT ------------------------------ */
  const ev = migration.createContentType('upcomingEvent')
    .name('Event')
    .description('An event card on the home page. Past events disappear automatically.')
    .displayField('title');

  ev.createField('title').name('Event title').type('Symbol').required(true).validations([{ size: { max: 120 } }]);
  ev.createField('date').name('Date and time').type('Date').required(true);
  ev.createField('location').name('Venue').type('Symbol').validations([{ size: { max: 140 } }]);
  ev.createField('description').name('Short description').type('Text').validations([{ size: { max: 300 } }]);
  ev.createField('flyer').name('Flyer / poster / image').type('Link').linkType('Asset').validations(IMAGE_ONLY);

  ev.changeFieldControl('date', 'builtin', 'datePicker', { format: 'timeZ', ampm: '12', helpText: 'Pick the date and the start time (East Africa Time).' });
  ev.changeFieldControl('location', 'builtin', 'singleLine', { helpText: 'e.g. Main Sanctuary' });
  ev.changeFieldControl('description', 'builtin', 'multipleLine', { helpText: 'Shown on the event card (max 300 characters).' });
  ev.changeFieldControl('flyer', 'builtin', 'assetLinkEditor', { helpText: 'Upload the flyer, poster or a photo. Landscape (16:9) works best.' });

  /* ------------------------------ LEADERS ---------------------------- */
  const lp = migration.createContentType('leadershipProfile')
    .name('Leader')
    .description('One person in LCC, Women Ministry or the Pastoral Team.')
    .displayField('name');

  lp.createField('name').name('Full name').type('Symbol').required(true).validations([{ size: { max: 120 } }]);
  lp.createField('group').name('Team').type('Symbol').required(true).validations([{ in: ['lcc', 'women', 'pastoral'] }]);
  lp.createField('role').name('Role / title').type('Symbol').validations([{ size: { max: 120 } }]);
  lp.createField('photo').name('Photo').type('Link').linkType('Asset').validations(IMAGE_ONLY);
  lp.createField('bio').name('About / message').type('Text').validations([{ size: { max: 3000 } }]);
  lp.createField('sortOrder').name('Display order').type('Integer');

  lp.changeFieldControl('group', 'builtin', 'dropdown', { helpText: 'lcc = LCC, women = Women Ministry, pastoral = Pastoral Team.' });
  lp.changeFieldControl('role', 'builtin', 'singleLine', { helpText: 'e.g. Chairman, Secretary, Senior Pastor. Optional.' });
  lp.changeFieldControl('photo', 'builtin', 'assetLinkEditor', { helpText: 'Optional. If empty, the card shows no photo.' });
  lp.changeFieldControl('bio', 'builtin', 'multipleLine', { helpText: 'Optional. A short bio, or the pastor welcome message. Shown under the name and role.' });
  lp.changeFieldControl('sortOrder', 'builtin', 'numberEditor', { helpText: 'Lower numbers appear first (1, 2, 3...).' });

  /* ------------------------------ MINISTRY --------------------------- */
  const mn = migration.createContentType('ministry')
    .name('Ministry')
    .description('A ministry card on the Ministries page.')
    .displayField('name');

  mn.createField('name').name('Ministry name').type('Symbol').required(true).validations([{ unique: true }, { size: { max: 120 } }]);
  mn.createField('description').name('Short description').type('Text').validations([{ size: { max: 500 } }]);
  mn.createField('image').name('Image').type('Link').linkType('Asset').validations(IMAGE_ONLY);
  mn.createField('meetingTime').name('When we meet').type('Symbol').validations([{ size: { max: 140 } }]);
  mn.createField('joiningInformation').name('How to join').type('Text').validations([{ size: { max: 2000 } }]);
  mn.createField('sortOrder').name('Display order').type('Integer');

  mn.changeFieldControl('description', 'builtin', 'multipleLine', { helpText: 'What this ministry is about.' });
  mn.changeFieldControl('image', 'builtin', 'assetLinkEditor', { helpText: 'Optional. Landscape photo works best.' });
  mn.changeFieldControl('meetingTime', 'builtin', 'singleLine', { helpText: 'e.g. Fridays 6:00 PM. Optional.' });
  mn.changeFieldControl('joiningInformation', 'builtin', 'multipleLine', { helpText: 'Contact person or how to sign up. Optional.' });
  mn.changeFieldControl('sortOrder', 'builtin', 'numberEditor', { helpText: 'Lower numbers appear first.' });

  /* ------------------------------ SERMONS ---------------------------- */
  // Existing model (API ID "sermons"). Field IDs title, preacher, date, powerpoint are untouched.
  const sm = migration.editContentType('sermons');

  sm.deleteField('thumbnailAlt');                 // the site uses the sermon title as the image text
  sm.changeFieldId('thumbnail', 'previewImage');  // the website reads "previewImage"; existing uploads are kept

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
  sm.changeFieldControl('scriptureReference', 'builtin', 'singleLine', { helpText: 'e.g. John 3:16-21' });
  sm.changeFieldControl('videoUrl', 'builtin', 'singleLine', { helpText: 'Optional. A YouTube or Vimeo link. Shows a "Watch sermon" button.' });
  sm.changeFieldControl('audioUrl', 'builtin', 'singleLine', { helpText: 'Optional. A direct https link to an mp3. Shows an audio player.' });
};
