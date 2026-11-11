/**
 * Creates the "Project" content type (API ID: project) in Contentful.
 *
 * Run it from the VS Code terminal (Ctrl + ` ), inside the folder that holds this file:
 *
 *   contentful space migration --space-id em08252vzuh6 --environment-id Church-Website contentful-project-model.cjs
 *
 * Type "y" when it asks you to confirm.
 *
 * Suggested shapes for the four JSON fields (these are only suggestions; use whatever your code expects):
 *   stakeholders: [{ "name": "Building Committee", "role": "Oversight", "contact": "" }]
 *   milestones:   [{ "title": "Foundation complete", "date": "2026-12-01", "status": "completed" }]
 *   updates:      [{ "date": "2026-11-10", "title": "Roofing started", "body": "..." }]
 *   reports:      [{ "title": "Q3 progress report", "url": "https://...", "date": "2026-10-01" }]
 */
const URL_RULE = [{ regexp: { pattern: '^https?://\\S+$' }, message: 'Must start with https://' }];
const IMAGE_ONLY = [{ linkMimetypeGroup: ['image'] }];

module.exports = function (migration) {
  const project = migration.createContentType('project')
    .name('Project')
    .description('A church project: status, funding, progress, milestones, updates and reports.')
    .displayField('title');

  /* ---------------------------- Fields ---------------------------- */
  project.createField('title').name('Project Title').type('Symbol').required(true)
    .validations([{ size: { max: 120 } }]);

  project.createField('slug').name('Slug').type('Symbol').required(true)
    .validations([
      { unique: true },
      { regexp: { pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }, message: 'Lowercase letters, numbers and hyphens only' },
    ]);

  project.createField('summary').name('Summary').type('Symbol')
    .validations([{ size: { max: 250 } }]);

  project.createField('description').name('Description').type('Text');

  project.createField('status').name('Status').type('Symbol').required(true)
    .validations([{ in: ['ongoing', 'proposed', 'completed', 'on-hold'] }])
    .defaultValue({ 'en-US': 'proposed' });

  project.createField('category').name('Category').type('Symbol')
    .validations([{ in: ['infrastructure', 'education', 'community', 'outreach', 'environment', 'other'] }])
    .defaultValue({ 'en-US': 'other' });

  project.createField('estimatedBudget').name('Estimated Budget').type('Number')
    .validations([{ range: { min: 0 } }]);

  project.createField('fundsReceived').name('Funds Received').type('Number')
    .validations([{ range: { min: 0 } }]);

  project.createField('progress').name('Implementation Progress').type('Integer')
    .validations([{ range: { min: 0, max: 100 }, message: 'Enter a whole number from 0 to 100' }]);

  project.createField('startDate').name('Start Date').type('Date');
  project.createField('expectedCompletion').name('Expected Completion').type('Date');

  project.createField('featured').name('Featured Project').type('Boolean')
    .defaultValue({ 'en-US': false });

  project.createField('coverImage').name('Cover Image').type('Link').linkType('Asset')
    .validations(IMAGE_ONLY);

  project.createField('gallery').name('Gallery').type('Array')
    .items({ type: 'Link', linkType: 'Asset', validations: IMAGE_ONLY });

  project.createField('supportUrl').name('Support URL').type('Symbol').validations(URL_RULE);
  project.createField('supportDescription').name('Support Description').type('Text');

  project.createField('stakeholders').name('Stakeholders').type('Object');
  project.createField('milestones').name('Milestones').type('Object');
  project.createField('updates').name('Updates').type('Object');
  project.createField('reports').name('Reports').type('Object');

  /* ------------------- Editor widgets and help text ------------------- */
  project.changeFieldControl('title', 'builtin', 'singleLine', { helpText: 'The name of the project.' });
  project.changeFieldControl('slug', 'builtin', 'slugEditor', { trackingFieldId: 'title', helpText: 'Used in the web address. Filled in automatically from the title.' });
  project.changeFieldControl('summary', 'builtin', 'singleLine', { helpText: 'One or two sentences for the project card (max 250 characters).' });
  project.changeFieldControl('description', 'builtin', 'multipleLine', { helpText: 'The full description of the project.' });
  project.changeFieldControl('status', 'builtin', 'dropdown', { helpText: 'ongoing, proposed, completed or on-hold.' });
  project.changeFieldControl('category', 'builtin', 'dropdown', { helpText: 'Choose the closest category.' });
  project.changeFieldControl('estimatedBudget', 'builtin', 'numberEditor', { helpText: 'Total estimated cost in KES.' });
  project.changeFieldControl('fundsReceived', 'builtin', 'numberEditor', { helpText: 'Amount received so far in KES.' });
  project.changeFieldControl('progress', 'builtin', 'numberEditor', { helpText: 'Whole number from 0 to 100.' });
  project.changeFieldControl('startDate', 'builtin', 'datePicker', { format: 'dateonly' });
  project.changeFieldControl('expectedCompletion', 'builtin', 'datePicker', { format: 'dateonly' });
  project.changeFieldControl('featured', 'builtin', 'boolean', { helpText: 'Turn on to highlight this project.' });
  project.changeFieldControl('coverImage', 'builtin', 'assetLinkEditor', { helpText: 'Landscape (16:9) works best.' });
  project.changeFieldControl('gallery', 'builtin', 'assetGalleryEditor', { helpText: 'Add as many photos as you like.' });
  project.changeFieldControl('supportUrl', 'builtin', 'singleLine', { helpText: 'Optional. A full https:// link for giving or support.' });
  project.changeFieldControl('supportDescription', 'builtin', 'multipleLine', { helpText: 'Optional. How people can support this project.' });
  project.changeFieldControl('stakeholders', 'builtin', 'objectEditor', { helpText: 'JSON list of the people or groups involved.' });
  project.changeFieldControl('milestones', 'builtin', 'objectEditor', { helpText: 'JSON list of milestones.' });
  project.changeFieldControl('updates', 'builtin', 'objectEditor', { helpText: 'JSON list of progress updates.' });
  project.changeFieldControl('reports', 'builtin', 'objectEditor', { helpText: 'JSON list of reports.' });
};
