/**
 * AIC Egerton Chapel: SIMPLIFY the existing Contentful models (edit, not delete)
 *
 * Event      -> title, date and time, venue, short description, flyer
 * Ministry   -> name, category, short description, image, how to join
 * Leader     -> full name, team (LCC / Women Ministry / Pastoral Team), role, photo, message, display order
 * Sermons    -> edits your existing "sermons" type: adds scripture + video/audio link, widens file types,
 *               removes thumbnailAlt. Existing field IDs are kept.
 *
 * Run:
 *   contentful space migration --space-id em08252vzuh6 --environment-id Church-Website contentful-simplify-models.cjs
 *
 * It only touches models that already exist from the first script. If you entered real entries
 * in them, tell Claude before running (removing a field removes that data).
 */

module.exports = function (migration) {
  /* ------------------------------ EVENT ------------------------------ */
  const event = migration.editContentType('event');

  ['slug', 'category', 'endDate', 'allDay', 'mapLink', 'description', 'imageAlt',
   'ministry', 'buttonLabel', 'buttonUrl', 'showInTicker'].forEach((id) => event.deleteField(id));

  event.editField('title').name('Event title');
  event.editField('startDate').name('Date and time').required(true);
  event.editField('locationName').name('Venue').required(true);
  event.editField('summary').name('Short description').required(true).validations([{ size: { max: 300 } }]);
  event.editField('image').name('Flyer / poster / image');

  event.changeFieldControl('startDate', 'builtin', 'datePicker', { helpText: 'Pick the date, then the start time.', format: 'timeZ' });
  event.changeFieldControl('locationName', 'builtin', 'singleLine', { helpText: 'e.g. Main Sanctuary' });
  event.changeFieldControl('summary', 'builtin', 'multipleLine', { helpText: 'Shown on the event card (max 300 characters).' });
  event.changeFieldControl('image', 'builtin', 'assetLinkEditor', { helpText: 'Upload the flyer, poster or a photo. Landscape (16:9) works best.' });

  /* ----------------------------- MINISTRY ---------------------------- */
  const ministry = migration.editContentType('ministry');

  ['slug', 'description', 'imageAlt', 'meetingSchedule', 'meetingLocation', 'leaders',
   'acceptingMembers', 'contactEmail', 'contactPhone', 'displayOrder'].forEach((id) => ministry.deleteField(id));

  ministry.editField('name').name('Ministry name');
  ministry.editField('category').name('Category').required(false);
  ministry.editField('tagline').name('Short description').required(true).validations([{ size: { max: 500 } }]);
  ministry.editField('image').name('Image');
  ministry.editField('joiningInformation').name('How to join');

  ministry.changeFieldControl('tagline', 'builtin', 'multipleLine', { helpText: 'What this ministry is about (shown on the card).' });
  ministry.changeFieldControl('joiningInformation', 'builtin', 'multipleLine', { helpText: 'Meeting times, contact person, how to sign up.' });

  /* ------------------------------ LEADER ----------------------------- */
  const leader = migration.editContentType('leader');

  ['slug', 'group', 'isLead', 'email', 'message'].forEach((id) => leader.deleteField(id));

  leader.createField('team')
    .name('Team')
    .type('Symbol')
    .required(true)
    .validations([{ in: ['LCC', 'Women Ministry', 'Pastoral Team'] }]);
  leader.changeFieldControl('team', 'builtin', 'dropdown', { helpText: 'Which group does this person belong to?' });

  leader.editField('fullName').name('Full name');
  leader.editField('role').name('Role / title');
  leader.editField('photo').name('Photo');
  leader.editField('bio').name('Message / about').validations([{ size: { max: 3000 } }]);
  leader.editField('displayOrder').name('Display order');

  leader.changeFieldControl('role', 'builtin', 'singleLine', { helpText: 'e.g. Chairman, Secretary, LCC Member, Senior Pastor. Leave empty for Women Ministry.' });
  leader.changeFieldControl('photo', 'builtin', 'assetLinkEditor', { helpText: 'Optional. If empty, the website shows an icon.' });
  leader.changeFieldControl('bio', 'builtin', 'multipleLine', { helpText: 'Optional. Mainly the Senior Pastor welcome message.' });
  leader.changeFieldControl('displayOrder', 'builtin', 'numberEditor', { helpText: 'Lower numbers appear first inside the team.' });

  /* ------------------------------ SERMONS ----------------------------- */
  // Your existing content type has the API ID "sermons". Its field IDs (title, preacher, date,
  // powerpoint, thumbnail) are kept exactly so sermons you already published keep working.
  const sermons = migration.editContentType('sermons');

  sermons.deleteField('thumbnailAlt');

  sermons.editField('date').name('Sermon date');

  sermons.editField('powerpoint')
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

  sermons.createField('scripture').name('Scripture').type('Symbol').validations([{ size: { max: 120 } }]);
  sermons.createField('mediaUrl').name('Video / audio link').type('Symbol')
    .validations([{ regexp: { pattern: '^https?://\\S+$' }, message: 'Must start with http:// or https://' }]);

  sermons.changeFieldControl('date', 'builtin', 'datePicker', { format: 'dateonly' });
  sermons.changeFieldControl('powerpoint', 'builtin', 'assetLinksEditor', { helpText: 'Upload up to 2 files: PDF, PowerPoint, Word, mp3 or video. Optional if you add a link below.' });
  sermons.changeFieldControl('thumbnail', 'builtin', 'assetLinkEditor', { helpText: 'Landscape (16:9) works best.' });
  sermons.changeFieldControl('scripture', 'builtin', 'singleLine', { helpText: 'e.g. John 3:16-21' });
  sermons.changeFieldControl('mediaUrl', 'builtin', 'singleLine', { helpText: 'Optional. A YouTube, Vimeo or mp3 link.' });
};
