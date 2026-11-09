/**
 * Creates two small Contentful models that your site already knows how to display:
 *   announcement  -> the scrolling announcement bar at the top of every page
 *   serviceTime   -> the "Service Times" list in the footer of every page
 *
 * Run:
 *   contentful space migration --space-id em08252vzuh6 --environment-id Church-Website contentful-announcements-service-times.cjs
 */
const URL_RULE = [{ regexp: { pattern: '^https?://\\S+$' }, message: 'Must start with https://' }];

module.exports = function (migration) {
  /* --------------------------- ANNOUNCEMENT --------------------------- */
  const an = migration.createContentType('announcement')
    .name('Announcement')
    .description('A message in the announcement bar at the top of the website.')
    .displayField('text');

  an.createField('text').name('Announcement message').type('Symbol').required(true).validations([{ size: { max: 250 } }]);
  an.createField('severity').name('Importance').type('Symbol').required(true)
    .validations([{ in: ['info', 'warning', 'urgent'] }]).defaultValue({ 'en-US': 'info' });
  an.createField('linkUrl').name('Link (optional)').type('Symbol').validations(URL_RULE);
  an.createField('linkLabel').name('Link button text').type('Symbol').validations([{ size: { max: 40 } }]);
  an.createField('startsAt').name('Show from').type('Date');
  an.createField('endsAt').name('Show until').type('Date');

  an.changeFieldControl('text', 'builtin', 'singleLine', { helpText: 'One short sentence (max 250 characters).' });
  an.changeFieldControl('severity', 'builtin', 'dropdown', { helpText: 'info = normal notice, warning = important, urgent = needs attention now.' });
  an.changeFieldControl('linkUrl', 'builtin', 'singleLine', { helpText: 'Optional. A full https:// link.' });
  an.changeFieldControl('linkLabel', 'builtin', 'singleLine', { helpText: 'Optional. e.g. Register now. Defaults to "Learn more".' });
  an.changeFieldControl('startsAt', 'builtin', 'datePicker', { format: 'timeZ', ampm: '12', helpText: 'Optional. Leave empty to show it as soon as you publish.' });
  an.changeFieldControl('endsAt', 'builtin', 'datePicker', { format: 'timeZ', ampm: '12', helpText: 'Optional. It disappears automatically after this time.' });

  /* --------------------------- SERVICE TIME --------------------------- */
  const st = migration.createContentType('serviceTime')
    .name('Service Time')
    .description('One line in the Service Times list in the website footer.')
    .displayField('label');

  st.createField('label').name('Service name').type('Symbol').required(true).validations([{ size: { max: 100 } }]);
  st.createField('day').name('Day').type('Symbol').required(true)
    .validations([{ in: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] }]);
  st.createField('start').name('Starts').type('Symbol').validations([{ size: { max: 20 } }]);
  st.createField('end').name('Ends').type('Symbol').validations([{ size: { max: 20 } }]);
  st.createField('isLive').name('Live-streamed').type('Boolean').defaultValue({ 'en-US': false });
  st.createField('sortOrder').name('Display order').type('Integer');

  st.changeFieldControl('label', 'builtin', 'singleLine', { helpText: 'e.g. Main Worship Service' });
  st.changeFieldControl('day', 'builtin', 'dropdown', { helpText: 'Shown in bold above the service name.' });
  st.changeFieldControl('start', 'builtin', 'singleLine', { helpText: 'e.g. 8:00 AM. Do not type "EAT"; the website adds it.' });
  st.changeFieldControl('end', 'builtin', 'singleLine', { helpText: 'Optional. e.g. 12:00 PM' });
  st.changeFieldControl('isLive', 'builtin', 'boolean', { helpText: 'Turn on to show "Live" next to this service.' });
  st.changeFieldControl('sortOrder', 'builtin', 'numberEditor', { helpText: 'Lower numbers appear first (1, 2, 3...).' });
};
