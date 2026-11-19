/**
 * Adds the extra fields the new Ministries page can show to your existing "ministry" model:
 *   motto, mission, meetingSchedule (one time per line), displayOrder
 *
 *   contentful space migration --space-id em08252vzuh6 --environment-id Church-Website contentful-ministry-fields.cjs
 *
 * If a field with one of these IDs already exists, Contentful stops and changes nothing;
 * tell Claude and the script will be trimmed.
 */
module.exports = function (migration) {
  const ministry = migration.editContentType('ministry');

  ministry.createField('motto').name('Motto or vision').type('Symbol').validations([{ size: { max: 160 } }]);
  ministry.createField('mission').name('Mission').type('Text').validations([{ size: { max: 600 } }]);
  ministry.createField('meetingSchedule').name('Weekly meetups').type('Text').validations([{ size: { max: 400 } }]);
  ministry.createField('displayOrder').name('Display order').type('Integer');

  ministry.changeFieldControl('motto', 'builtin', 'singleLine', { helpText: 'One guiding line shown as a quote, e.g. "To lead the congregation in genuine worship of God."' });
  ministry.changeFieldControl('mission', 'builtin', 'multipleLine', { helpText: 'What this ministry does (shown in the details panel).' });
  ministry.changeFieldControl('meetingSchedule', 'builtin', 'multipleLine', { helpText: 'One meeting per line, e.g. "Fridays at 5:00 PM". Shown as badges.' });
  ministry.changeFieldControl('displayOrder', 'builtin', 'numberEditor', { helpText: 'Optional. Lower numbers appear first.' });
  // Tip: set the existing "Category" to one of: Fellowships & Groups, Music & Worship, Service & Operations, Youth & Children
  ministry.changeFieldControl('category', 'builtin', 'singleLine', { helpText: 'Use one of: Fellowships & Groups, Music & Worship, Service & Operations, Youth & Children. This decides the filter tab.' });
};
