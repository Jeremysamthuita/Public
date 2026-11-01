const contentTypes = {
  sermons: {
    label: 'Sermons',
    table: 'cms_sermons',
    fields: [
      ['title', 'Title', 'text', true], ['preacher', 'Preacher', 'text', true],
      ['ministry_title', 'Ministry title', 'text'], ['scripture_reference', 'Scripture', 'text'],
      ['series', 'Series', 'text'], ['sermon_date', 'Date', 'date', true],
      ['description', 'Description', 'textarea'], ['preview_image_url', 'Preview image URL', 'url'],
      ['pdf_url', 'PDF URL', 'url'], ['files', 'Additional files (JSON)', 'json'],
      ['audio_url', 'Audio URL', 'url'], ['video_url', 'Video URL', 'url'],
      ['tags', 'Tags (comma-separated)', 'list'], ['featured', 'Featured', 'checkbox']
    ]
  },
  events: {
    label: 'Events', table: 'cms_events',
    fields: [
      ['title', 'Title', 'text', true], ['event_date', 'Date', 'date', true],
      ['end_date', 'End date', 'date'], ['event_time', 'Time', 'text'],
      ['location', 'Location', 'text'], ['description', 'Description', 'textarea'],
      ['flyer_url', 'Flyer URL', 'url'], ['flyer_alt', 'Flyer alt text', 'text'],
      ['registration_url', 'Registration URL', 'url'], ['category', 'Category', 'text'],
      ['active', 'Active', 'checkbox']
    ]
  },
  leadership: {
    label: 'Leadership', table: 'cms_leadership',
    fields: [
      ['group_name', 'Group', 'select', true, ['lcc', 'women', 'pastoral']],
      ['name', 'Name', 'text', true], ['role', 'Role', 'text'],
      ['bio', 'Biography', 'textarea'], ['message', 'Message', 'textarea'],
      ['photo_url', 'Photo URL', 'url'], ['active', 'Active', 'checkbox']
    ]
  },
  gallery: {
    label: 'Gallery', table: 'cms_gallery',
    fields: [
      ['image_url', 'Image URL', 'url', true], ['alt', 'Alt text', 'text'],
      ['caption', 'Caption', 'textarea']
    ]
  },
  announcements: {
    label: 'Announcements', table: 'cms_announcements',
    fields: [
      ['announcement_text', 'Announcement', 'textarea', true], ['link_url', 'Link URL', 'url'],
      ['link_label', 'Link label', 'text'],
      ['severity', 'Severity', 'select', true, ['info', 'success', 'warning', 'urgent']],
      ['starts_at', 'Starts at', 'datetime-local'], ['ends_at', 'Ends at', 'datetime-local']
    ]
  },
  ministries: {
    label: 'Ministries', table: 'cms_ministries',
    fields: [
      ['name', 'Name', 'text', true], ['description', 'Description', 'textarea'],
      ['leader', 'Leader', 'text'], ['meeting_time', 'Meeting time', 'text'],
      ['contact', 'Contact', 'text'], ['image_url', 'Image URL', 'url'],
      ['accepting_applications', 'Accepting applications', 'checkbox']
    ]
  },
  service_times: {
    label: 'Service times', table: 'cms_service_times',
    fields: [
      ['label', 'Service name', 'text', true], ['day', 'Day', 'text', true],
      ['start_time', 'Start time', 'text'], ['end_time', 'End time', 'text'],
      ['is_live', 'Live service', 'checkbox']
    ]
  },
  settings: {
    label: 'Settings', table: 'cms_settings',
    fields: [
      ['setting_key', 'Setting key', 'text', true],
      ['setting_value', 'Setting value (JSON)', 'json', true]
    ]
  }
};

const commonFields = [
  ['is_published', 'Published', 'checkbox'],
  ['publish_at', 'Publish at', 'datetime-local'],
  ['unpublish_at', 'Unpublish at', 'datetime-local'],
  ['sort_order', 'Sort order', 'number']
];

function node(tag, value = '', className = '') {
  const element = document.createElement(tag);
  if (value) element.textContent = value;
  if (className) element.className = className;
  return element;
}

function asLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formField([name, labelText, type, required = false, options = []], value, form) {
  const wrapper = node('div', '', 'field');
  const label = node('label', labelText);
  label.htmlFor = `cms-field-${name}`;
  let input;
  if (type === 'textarea' || type === 'json') {
    input = document.createElement('textarea');
    input.rows = type === 'json' ? 4 : 3;
    if (type === 'json') input.value = value ? JSON.stringify(value, null, 2) : '';
    else input.value = value ?? '';
  } else if (type === 'select') {
    input = document.createElement('select');
    for (const optionValue of options) {
      const option = node('option', optionValue);
      option.value = optionValue;
      input.appendChild(option);
    }
    input.value = value || options[0];
  } else {
    input = document.createElement('input');
    input.type = type;
    input.value = type === 'datetime-local' ? asLocalDateTime(value) : (value ?? '');
  }
  input.id = `cms-field-${name}`;
  input.name = name;
  input.required = required;
  if (type === 'checkbox') input.checked = Boolean(value);
  if (type === 'number') input.step = name === 'premium_amount' ? '0.01' : '1';
  wrapper.append(label, input);
  form.appendChild(wrapper);
  return input;
}

function recordLabel(type, record) {
  return record.title || record.name || record.label || record.announcement_text ||
    record.setting_key || record.image_url || `${contentTypes[type].label} entry`;
}

function createPanel(supabase, session) {
  const tabs = document.querySelector('.adm-tabs');
  const dashboard = document.getElementById('dashView');
  if (!tabs || !dashboard) return null;

  const tab = node('button', 'Content management', 'adm-tab');
  tab.type = 'button';
  tab.dataset.panel = 'cms';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', 'panel-cms');
  tabs.appendChild(tab);

  const panel = node('section', '', 'adm-panel');
  panel.id = 'panel-cms';
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'cms-tab');
  const heading = node('h2', 'Content management');
  panel.appendChild(heading);

  const toolbar = node('div', '', 'cms-admin-toolbar');
  const typeSelect = document.createElement('select');
  typeSelect.id = 'cms-content-type';
  typeSelect.setAttribute('aria-label', 'Content type');
  for (const [type, definition] of Object.entries(contentTypes)) {
    const option = node('option', definition.label);
    option.value = type;
    typeSelect.appendChild(option);
  }
  const newButton = node('button', 'New entry');
  newButton.type = 'button';
  const syncButton = node('button', 'Sync Contentful');
  syncButton.type = 'button';
  syncButton.id = 'cms-sync-button';
  toolbar.append(typeSelect, newButton, syncButton);
  panel.appendChild(toolbar);

  const status = node('p', '', 'cms-admin-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  panel.appendChild(status);

  const list = node('div', '', 'cms-admin-list');
  panel.appendChild(list);
  const historyHeading = node('h3', 'Recent Contentful synchronization');
  panel.appendChild(historyHeading);
  const history = node('ul', '', 'cms-sync-history');
  panel.appendChild(history);
  const editor = document.createElement('form');
  editor.className = 'cms-admin-form';
  editor.hidden = true;
  editor.noValidate = false;
  panel.appendChild(editor);
  dashboard.appendChild(panel);

  tab.id = 'cms-tab';
  tab.addEventListener('click', () => {
    document.querySelectorAll('.adm-tab').forEach(item => item.classList.toggle('active', item === tab));
    document.querySelectorAll('.adm-panel').forEach(item => item.classList.toggle('active', item === panel));
  });

  const state = {type: typeSelect.value, records: []};
  const setStatus = message => { status.textContent = message; };

  async function loadRecords() {
    const definition = contentTypes[state.type];
    list.replaceChildren(node('p', 'Loading…'));
    const {data, error} = await supabase.from(definition.table)
      .select('*').order('sort_order', {ascending: true}).limit(300);
    if (error) {
      setStatus(`Could not load ${definition.label.toLowerCase()}: ${error.message}`);
      list.replaceChildren();
      return;
    }
    state.records = data || [];
    list.replaceChildren();
    if (!state.records.length) {
      list.appendChild(node('p', 'No records yet.'));
      return;
    }
    const table = document.createElement('table');
    table.className = 'adm-table';
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const title of ['Content', 'Source', 'Status', 'Actions']) headerRow.appendChild(node('th', title));
    head.appendChild(headerRow);
    const body = document.createElement('tbody');
    for (const record of state.records) {
      const row = document.createElement('tr');
      row.appendChild(node('td', recordLabel(state.type, record)));
      row.appendChild(node('td', record.source || 'supabase'));
      row.appendChild(node('td', record.locally_hidden ? 'Hidden' : record.is_published ? 'Published' : 'Draft'));
      const actions = document.createElement('td');
      actions.className = 'adm-actions';
      if (record.source === 'contentful') {
        const hide = node('button', record.locally_hidden ? 'Restore' : 'Hide');
        hide.type = 'button';
        hide.addEventListener('click', async () => {
          hide.disabled = true;
          const {error: updateError} = await supabase.from(definition.table)
            .update({locally_hidden: !record.locally_hidden}).eq('id', record.id);
          if (updateError) setStatus(`Could not update mirrored content: ${updateError.message}`);
          else setStatus(record.locally_hidden ? 'Content restored.' : 'Content hidden locally.');
          await loadRecords();
        });
        actions.appendChild(hide);
      } else {
        const edit = node('button', 'Edit');
        edit.type = 'button';
        edit.addEventListener('click', () => showEditor(record));
        const remove = node('button', 'Delete', 'danger');
        remove.type = 'button';
        remove.addEventListener('click', async () => {
          if (!window.confirm(`Delete “${recordLabel(state.type, record)}”?`)) return;
          const {error: deleteError} = await supabase.from(definition.table).delete().eq('id', record.id);
          if (deleteError) setStatus(`Could not delete record: ${deleteError.message}`);
          else setStatus('Record deleted.');
          await loadRecords();
        });
        actions.append(edit, remove);
      }
      row.appendChild(actions);
      body.appendChild(row);
    }
    table.append(head, body);
    list.appendChild(table);
  }

  async function loadSyncHistory() {
    const {data, error} = await supabase.from('cms_sync_log')
      .select('content_type,status,message,record_count,completed_at')
      .order('completed_at', {ascending: false}).limit(12);
    history.replaceChildren();
    if (error) {
      history.appendChild(node('li', `Sync history is unavailable: ${error.message}`));
      return;
    }
    if (!data?.length) {
      history.appendChild(node('li', 'No synchronization runs recorded yet.'));
      return;
    }
    for (const entry of data) {
      const date = new Date(entry.completed_at).toLocaleString();
      history.appendChild(node('li',
        `${date} — ${entry.content_type}: ${entry.status} (${entry.record_count})${entry.message ? ` — ${entry.message}` : ''}`));
    }
  }

  function showEditor(record = null) {
    editor.replaceChildren();
    editor.hidden = false;
    const title = node('h3', record ? `Edit ${recordLabel(state.type, record)}` : `New ${contentTypes[state.type].label} entry`);
    editor.appendChild(title);
    if (record) {
      const id = document.createElement('input');
      id.type = 'hidden';
      id.name = 'id';
      id.value = record.id;
      editor.appendChild(id);
    }
    for (const field of [...contentTypes[state.type].fields, ...commonFields]) {
      formField(field, record?.[field[0]], editor);
    }
    const controls = node('div', '', 'cms-admin-toolbar');
    const save = node('button', 'Save');
    save.type = 'submit';
    const cancel = node('button', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { editor.hidden = true; });
    controls.append(save, cancel);
    editor.appendChild(controls);
    const uploadFields = [...contentTypes[state.type].fields].filter(([, , type]) => type === 'url');
    if (uploadFields.length && supabase.storage) {
      const uploadLabel = node('label', 'Upload media to a URL field');
      const uploadField = document.createElement('select');
      uploadField.setAttribute('aria-label', 'URL field for uploaded media');
      for (const [fieldName, fieldLabel] of uploadFields) {
        const option = node('option', fieldLabel);
        option.value = fieldName;
        uploadField.appendChild(option);
      }
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/mp4';
      file.setAttribute('aria-label', 'Select a media file');
      const upload = node('button', 'Upload');
      upload.type = 'button';
      upload.addEventListener('click', async () => {
        if (!file.files?.[0]) {
          setStatus('Choose a file before uploading.');
          return;
        }
        const selected = file.files[0];
        if (selected.size > 8 * 1024 * 1024) {
          setStatus('Files must be 8 MB or smaller.');
          return;
        }
        const safeName = selected.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120);
        const path = `${state.type}/${crypto.randomUUID()}-${safeName}`;
        upload.disabled = true;
        setStatus('Uploading media…');
        const {error: uploadError} = await supabase.storage.from('cms-media')
          .upload(path, selected, {upsert: false, contentType: selected.type});
        if (uploadError) {
          setStatus(`Upload failed: ${uploadError.message}`);
        } else {
          const {data} = supabase.storage.from('cms-media').getPublicUrl(path);
          const target = editor.elements.namedItem(uploadField.value);
          target.value = data.publicUrl;
          setStatus('Upload complete. Save the entry to publish this URL.');
        }
        upload.disabled = false;
      });
      const uploadControls = node('div', '', 'cms-admin-upload');
      uploadControls.append(uploadLabel, uploadField, file, upload);
      editor.appendChild(uploadControls);
    }
    editor.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function readFormValue(field, form) {
    const [name, , type] = field;
    const input = form.elements.namedItem(name);
    if (type === 'checkbox') return input.checked;
    if (type === 'json') {
      if (!input.value.trim()) return name === 'files' ? [] : {};
      return JSON.parse(input.value);
    }
    if (type === 'list') return input.value.split(',').map(value => value.trim()).filter(Boolean);
    if (type === 'datetime-local') return input.value ? new Date(input.value).toISOString() : null;
    if (type === 'number') return input.value === '' ? 0 : Number(input.value);
    return input.value.trim() || null;
  }

  editor.addEventListener('submit', async event => {
    event.preventDefault();
    setStatus('Saving…');
    const definition = contentTypes[state.type];
    const data = {};
    try {
      for (const field of [...definition.fields, ...commonFields]) {
        data[field[0]] = readFormValue(field, editor);
      }
    } catch (error) {
      setStatus(`Please correct the JSON field: ${error.message}`);
      return;
    }
    const id = editor.elements.namedItem('id')?.value;
    if (id) {
      const {error} = await supabase.from(definition.table).update(data).eq('id', id);
      if (error) {
        setStatus(`Could not save record: ${error.message}`);
        return;
      }
    } else {
      data.source = 'supabase';
      data.created_by = session.user.id;
      const {error} = await supabase.from(definition.table).insert(data);
      if (error) {
        setStatus(`Could not create record: ${error.message}`);
        return;
      }
    }
    editor.hidden = true;
    setStatus('Record saved.');
    await loadRecords();
  });

  typeSelect.addEventListener('change', () => {
    state.type = typeSelect.value;
    editor.hidden = true;
    setStatus('');
    loadRecords();
  });
  newButton.addEventListener('click', () => showEditor());
  syncButton.addEventListener('click', async () => {
    syncButton.disabled = true;
    setStatus('Synchronizing Contentful content…');
    try {
      const response = await fetch('/.netlify/functions/cms-sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({types: Object.keys(contentTypes)})
      });
      const result = await response.json();
      if (!response.ok) {
        await loadSyncHistory();
        const failures = result.failures?.map(failure => `${failure.content_type}: ${failure.message}`).join('; ');
        throw new Error(result.error || failures || `Sync failed with HTTP ${response.status}.`);
      }
      setStatus(`Sync complete: ${result.synced} records across ${result.types} content types.`);
      await loadRecords();
      await loadSyncHistory();
    } catch (error) {
      setStatus(`Contentful sync failed: ${error.message}`);
    } finally {
      syncButton.disabled = false;
    }
  });
  void loadRecords();
  void loadSyncHistory();
  return {loadRecords};
}

export function initCmsAdmin(supabase, session) {
  if (!supabase || !session?.user || document.getElementById('panel-cms')) return;
  createPanel(supabase, session);
}
