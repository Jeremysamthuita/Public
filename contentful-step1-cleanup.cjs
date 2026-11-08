/**
 * STEP 1 of 2: remove the four models I created earlier that the website does not read
 * (or reads with different field names). Dependents are deleted first.
 *
 * Contentful refuses to delete a model that still has entries, so this is safe:
 * if any entries exist, it stops and changes nothing.
 *
 *   contentful space migration --space-id em08252vzuh6 --environment-id Church-Website contentful-step1-cleanup.cjs
 */
module.exports = function (migration) {
  ['event', 'ministry', 'leader', 'leadershipGroup'].forEach((id) => migration.deleteContentType(id));
};
