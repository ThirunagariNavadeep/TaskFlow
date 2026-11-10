const csrfKey = 'taskflow-csrf-token';
const state = { user: null, csrfToken: '', projects: [], tasks: [], activePage: '' };
const pageTitles = {
  dashboard: ['Workspace', 'Overview'],
  projects: ['Workspace', 'Projects'],
  project: ['Workspace / Projects', 'Project details'],
  tasks: ['Workspace', 'Tasks'],
  profile: ['Account', 'Your profile'],
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function parsePositiveInteger(value, label) {
  const text = String(value ?? '');
  if (!/^[1-9]\d*$/.test(text)) {
    throw new Error(`${label} must be a valid positive integer.`);
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be a valid positive integer.`);
  }
  return parsed;
}

function readActionId(button, label) {
  try {
    return parsePositiveInteger(button.dataset.id, label);
  } catch (error) {
    showToast(error.message, true);
    return null;
  }
}

function formatDate(value) {
  if (!value) return 'No date set';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function showToast(message, isError = false) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => toast.classList.remove('visible'), 3200);
}

async function api(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (['POST', 'PUT', 'DELETE'].includes(method) && state.csrfToken) {
    headers.set('X-CSRF-Token', state.csrfToken);
  }
  const response = await fetch(url, { ...options, method, headers, credentials: 'same-origin' });
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(result.detail)
      ? result.detail.map((issue) => issue.msg).join(', ')
      : result.detail;
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return result;
}

function setLoadingError(message) {
  const content = document.querySelector('#content');
  content.innerHTML = `<div class="panel empty-state"><div class="empty-mark">!</div><h3>We couldn't load this view</h3><p>${escapeHtml(message)}</p><button class="button button-secondary" data-action="retry">Try again</button></div>`;
}

function renderSidebar() {
  const page = state.activePage;
  const links = [
    ['dashboard', '/', 'D', 'Overview'],
    ['projects', '/projects', 'P', 'Projects'],
    ['tasks', '/tasks', 'T', 'Tasks'],
    ['profile', '/profile', 'U', 'Profile'],
  ];
  const sidebar = document.querySelector('#sidebar');
  sidebar.innerHTML = `
    <a class="brand" href="/" aria-label="TaskFlow overview"><span class="brand-mark">T</span><span>taskflow</span></a>
    <p class="sidebar-caption">Your workspace</p>
    <nav class="side-nav" aria-label="Main navigation">${links.map(([key, href, mark, label]) => `
      <a class="side-link ${page === key || (page === 'project' && key === 'projects') ? 'active' : ''}" href="${href}" ${page === key ? 'aria-current="page"' : ''}>
        <span class="side-icon" aria-hidden="true">${mark}</span><span>${label}</span>
      </a>`).join('')}
    </nav>
    <div class="sidebar-bottom">
      <div class="sidebar-note"><strong>A little progress adds up.</strong><span>Keep your next steps visible and the momentum follows.</span></div>
      <div class="user-mini">
        <span class="avatar" aria-hidden="true">${escapeHtml(initials(state.user.username))}</span>
        <div class="user-mini-copy"><strong>${escapeHtml(state.user.username)}</strong><span>${escapeHtml(state.user.email)}</span></div>
        <button class="logout-button" data-action="logout" type="button" title="Sign out">Out</button>
      </div>
    </div>`;
}

function renderTopbar() {
  const [section, title] = pageTitles[state.activePage] || pageTitles.dashboard;
  document.querySelector('#topbar').innerHTML = `
    <div><p class="breadcrumb">${section}</p><h1 class="topbar-title">${title}</h1></div>
    <div class="topbar-actions">
      ${state.activePage !== 'profile' ? '<a class="button button-secondary browse-button" href="/projects">Browse projects</a>' : ''}
      ${['dashboard', 'projects', 'project', 'tasks'].includes(state.activePage) ? '<button class="button button-primary" data-action="new-task" type="button"><span aria-hidden="true">+</span> New task</button>' : ''}
      <button class="button button-secondary mobile-logout" data-action="logout" type="button">Sign out</button>
    </div>`;
}

function emptyState(title, description, buttonLabel, action) {
  return `<div class="panel empty-state"><div class="empty-mark" aria-hidden="true">+</div><h3>${title}</h3><p>${description}</p><button class="button button-primary" data-action="${action}" type="button">${buttonLabel}</button></div>`;
}

function statusPill(status) {
  const className = status === 'Completed' ? 'pill-completed' : status === 'In Progress' ? 'pill-progress' : 'pill-pending';
  return `<span class="pill ${className}">${escapeHtml(status)}</span>`;
}

function priorityPill(priority) {
  const className = priority === 'High' ? 'pill-high' : priority === 'Low' ? 'pill-low' : 'pill-medium';
  return `<span class="pill ${className}">${escapeHtml(priority)}</span>`;
}

function taskRow(task, projectName = '') {
  return `<article class="task-row">
    <div>
      <a class="task-title-link" href="/tasks" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</a>
      <div class="task-meta"><span>${escapeHtml(projectName || 'Due')} ${projectName ? '·' : ''}</span><span>${formatDate(task.due_date)}</span>${priorityPill(task.priority)}</div>
    </div>
    <div class="task-actions">${statusPill(task.status)}<button class="text-button" data-action="edit-task" data-id="${task.id}" type="button">Edit</button></div>
  </article>`;
}

async function loadDashboard() {
  const [stats, projects] = await Promise.all([api('/api/dashboard/stats'), api('/api/projects')]);
  state.projects = projects;
  const projectNames = new Map(projects.map((project) => [project.id, project.project_name]));
  const recent = stats.recent_tasks.length
    ? `<div class="task-list">${stats.recent_tasks.map((task) => taskRow(task, projectNames.get(task.project_id))).join('')}</div>`
    : emptyState('Your first task starts here', 'Create a task to give your project a clear next step.', 'Create a task', 'new-task');
  document.querySelector('#content').innerHTML = `
    <div class="page-intro"><div><p class="eyebrow">A steady view of the work</p><h2>Good morning, ${escapeHtml(state.user.username.split(/[\s._-]/)[0])}.</h2><p>Here is what is moving across your workspace.</p></div><a class="button button-secondary" href="/tasks">View all tasks <span aria-hidden="true">&#8594;</span></a></div>
    <div class="metric-grid">
      <article class="metric-card"><span class="metric-label">Projects</span><strong class="metric-value">${stats.total_projects}</strong><span class="metric-foot">Across your workspace</span></article>
      <article class="metric-card"><span class="metric-label">All tasks</span><strong class="metric-value">${stats.total_tasks}</strong><span class="metric-foot">Every next step, in one place</span></article>
      <article class="metric-card"><span class="metric-label">In progress</span><strong class="metric-value">${stats.in_progress_tasks}</strong><span class="metric-foot">Work underway right now</span></article>
      <article class="metric-card"><span class="metric-label">Completed</span><strong class="metric-value">${stats.completed_tasks}</strong><span class="metric-foot">Steps moved over the line</span></article>
    </div>
    <div class="content-grid">
      <section class="panel"><div class="panel-heading"><h3>Recent tasks</h3><a class="text-button" href="/tasks">See all</a></div><div class="panel-body">${recent}</div></section>
      <section class="panel"><div class="panel-heading"><h3>Progress at a glance</h3></div><div class="panel-body">
        <div class="progress-wrap"><div class="progress-ring" style="--progress:${stats.completion_percentage}%"><span>${stats.completion_percentage}%</span></div><div class="progress-copy"><strong>Tasks completed</strong><span>A little progress, consistently, makes a big difference.</span></div></div>
        <div class="status-legend"><div class="legend-row"><span class="legend-label"><i class="legend-dot" style="--dot:#aeb8b2"></i>Pending</span><strong>${stats.pending_tasks}</strong></div><div class="legend-row"><span class="legend-label"><i class="legend-dot" style="--dot:#6c96c1"></i>In progress</span><strong>${stats.in_progress_tasks}</strong></div><div class="legend-row"><span class="legend-label"><i class="legend-dot" style="--dot:#66a77c"></i>Completed</span><strong>${stats.completed_tasks}</strong></div></div>
      </div></section>
    </div>`;
}

async function loadProjects() {
  const [projects, tasks] = await Promise.all([api('/api/projects'), api('/api/tasks')]);
  state.projects = projects;
  state.tasks = tasks;
  const content = document.querySelector('#content');
  if (!projects.length) {
    content.innerHTML = `<div class="page-intro"><div><p class="eyebrow">Make the work visible</p><h2>Your projects</h2><p>Group related tasks and keep the bigger picture close.</p></div></div>${emptyState('A good place to begin', 'Create a project for something you are working toward.', 'Create a project', 'new-project')}`;
    return;
  }
  content.innerHTML = `<div class="page-intro"><div><p class="eyebrow">Make the work visible</p><h2>Your projects</h2><p>${projects.length} ${projects.length === 1 ? 'project' : 'projects'} keeping your work in motion.</p></div><button class="button button-primary" data-action="new-project" type="button"><span aria-hidden="true">+</span> New project</button></div>
    <div class="project-grid">${projects.map((project) => {
      const projectTasks = tasks.filter((task) => task.project_id === project.id);
      const completed = projectTasks.filter((task) => task.status === 'Completed').length;
      const progress = projectTasks.length ? Math.round(completed / projectTasks.length * 100) : 0;
      return `<article class="project-card">
        <div class="project-card-top"><span class="project-symbol" aria-hidden="true">${escapeHtml(project.project_name.trim()[0]?.toUpperCase() || 'P')}</span><div class="project-menu"><button class="text-button" data-action="edit-project" data-id="${project.id}" type="button">Edit</button><button class="text-button" data-action="delete-project" data-id="${project.id}" type="button">Delete</button></div></div>
        <div class="project-card-body"><h3><a href="/project?id=${project.id}">${escapeHtml(project.project_name)}</a></h3><p>${escapeHtml(project.description || 'A place for your next steps and milestones.')}</p>
          <div class="project-progress" role="progressbar" aria-label="Project completion" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></div>
          <div class="project-card-foot"><span>${projectTasks.length} ${projectTasks.length === 1 ? 'task' : 'tasks'} · ${progress}% complete</span><a class="project-open" href="/project?id=${project.id}">Open project &#8594;</a></div>
        </div>
      </article>`;
    }).join('')}</div>`;
}

async function loadProjectDetail() {
  const projectId = parsePositiveInteger(new URLSearchParams(location.search).get('id'), 'Project ID');
  const [project, tasks] = await Promise.all([api(`/api/projects/${projectId}`), api(`/api/tasks?project_id=${projectId}`)]);
  state.projects = [project];
  state.tasks = tasks;
  document.querySelector('.topbar-title').textContent = project.project_name;
  document.querySelector('#content').innerHTML = `
    <div class="page-intro"><div><p class="eyebrow"><a href="/projects">Projects</a> / Project details</p><h2>Project workspace</h2><p>Keep its next steps moving and its deadline in view.</p></div><button class="button button-primary" data-action="new-task" type="button"><span aria-hidden="true">+</span> Add task</button></div>
    <section class="project-hero"><div><h2>${escapeHtml(project.project_name)}</h2><p>${escapeHtml(project.description || 'No description yet.')}</p></div><div class="project-hero-date">Deadline<br><strong>${formatDate(project.deadline)}</strong></div></section>
    <section class="panel"><div class="panel-heading"><h3>Tasks in this project</h3><span class="pill">${tasks.length} total</span></div><div class="panel-body">${tasks.length ? `<div class="task-list">${tasks.map((task) => taskRow(task)).join('')}</div>` : emptyState('Nothing on the list yet', 'Add a task to turn this project into a few clear next steps.', 'Add a task', 'new-task')}</div></section>`;
}

function taskTable(tasks) {
  if (!tasks.length) return '<div class="table-empty">No tasks match these filters.</div>';
  const projectNames = new Map(state.projects.map((project) => [project.id, project.project_name]));
  return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Task</th><th>Project</th><th>Priority</th><th>Status</th><th>Due date</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${tasks.map((task) => `
    <tr><td class="title-cell">${escapeHtml(task.title)}${task.description ? `<div class="task-meta">${escapeHtml(task.description)}</div>` : ''}</td><td>${escapeHtml(projectNames.get(task.project_id) || 'Project')}</td><td>${priorityPill(task.priority)}</td>
    <td><select class="field-control status-select" data-action="status" data-id="${task.id}" aria-label="Status for ${escapeHtml(task.title)}">${['Pending', 'In Progress', 'Completed'].map((status) => `<option ${task.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></td>
    <td>${formatDate(task.due_date)}</td><td><div class="table-actions"><button class="text-button" data-action="edit-task" data-id="${task.id}" type="button">Edit</button><button class="text-button" data-action="delete-task" data-id="${task.id}" type="button">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

async function loadTasks() {
  const [projects, tasks] = await Promise.all([api('/api/projects'), api('/api/tasks')]);
  state.projects = projects;
  state.tasks = tasks;
  const content = document.querySelector('#content');
  content.innerHTML = `<div class="page-intro"><div><p class="eyebrow">One next step at a time</p><h2>All tasks</h2><p>Search, sort and update the work across your projects.</p></div><button class="button button-primary" data-action="new-task" type="button"><span aria-hidden="true">+</span> New task</button></div>
    <div class="toolbar" role="search"><label class="search-wrap"><span class="search-mark" aria-hidden="true">&#8981;</span><span class="sr-only">Search tasks</span><input id="task-search" type="search" placeholder="Search tasks or descriptions" autocomplete="off"></label>
      <select id="status-filter" aria-label="Filter by status"><option value="">All statuses</option><option>Pending</option><option>In Progress</option><option>Completed</option></select>
      <select id="priority-filter" aria-label="Filter by priority"><option value="">All priorities</option><option>Low</option><option>Medium</option><option>High</option></select>
      <select id="sort-filter" aria-label="Sort tasks"><option value="created_at:desc">Newest first</option><option value="created_at:asc">Oldest first</option><option value="due_date:asc">Due date, soonest</option><option value="due_date:desc">Due date, latest</option></select>
    </div><section class="panel"><div class="panel-heading"><h3>Task list</h3><span class="pill" id="task-count">${tasks.length} tasks</span></div><div id="task-results">${taskTable(tasks)}</div></section>`;
  const refresh = async () => {
    const query = new URLSearchParams();
    const search = document.querySelector('#task-search').value.trim();
    const taskStatus = document.querySelector('#status-filter').value;
    const priority = document.querySelector('#priority-filter').value;
    const [sortBy, order] = document.querySelector('#sort-filter').value.split(':');
    if (search) query.set('search', search);
    if (taskStatus) query.set('status', taskStatus);
    if (priority) query.set('priority', priority);
    query.set('sort_by', sortBy);
    query.set('order', order);
    try {
      const filtered = await api(`/api/tasks?${query}`);
      document.querySelector('#task-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'task' : 'tasks'}`;
      document.querySelector('#task-results').innerHTML = taskTable(filtered);
    } catch (error) {
      showToast(error.message, true);
    }
  };
  let searchTimer;
  document.querySelector('#task-search').addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(refresh, 180);
  });
  document.querySelectorAll('#status-filter, #priority-filter, #sort-filter').forEach((control) => control.addEventListener('change', refresh));
}

function loadProfile() {
  const user = state.user;
  document.querySelector('#content').innerHTML = `<div class="page-intro"><div><p class="eyebrow">The person behind the progress</p><h2>Your profile</h2><p>Your account details and workspace identity.</p></div></div>
    <div class="profile-layout"><section class="profile-card"><div class="profile-identity"><span class="avatar avatar-large" aria-hidden="true">${escapeHtml(initials(user.username))}</span><div><h3>${escapeHtml(user.username)}</h3><p>${escapeHtml(user.email)}</p></div></div><div class="profile-details"><div><span class="detail-label">Username</span><span class="detail-value">${escapeHtml(user.username)}</span></div><div><span class="detail-label">Email address</span><span class="detail-value">${escapeHtml(user.email)}</span></div><div><span class="detail-label">Member since</span><span class="detail-value">${formatDate(user.created_at)}</span></div><div><span class="detail-label">Account security</span><span class="detail-value">Password protected</span></div></div></section>
      <aside class="profile-aside"><p class="eyebrow">Your workspace</p><h3>Made for steady progress.</h3><p>Your projects and tasks are private to your account. TaskFlow keeps your work organized so you can spend less time tracking it and more time doing it.</p></aside></div>`;
}

function openRecordDialog(kind, record = null) {
  const dialog = document.querySelector('#record-dialog');
  const isProject = kind === 'project';
  const projectOptions = state.projects.map((project) => `<option value="${project.id}" ${record?.project_id === project.id ? 'selected' : ''}>${escapeHtml(project.project_name)}</option>`).join('');
  const heading = `${record ? 'Edit' : 'New'} ${isProject ? 'project' : 'task'}`;
  const fields = isProject ? `
    <label>Project name<input name="project_name" required minlength="1" maxlength="120" placeholder="e.g. Website refresh"></label>
    <label>Description<textarea name="description" maxlength="5000" placeholder="What is this project working toward?"></textarea></label>
    <label>Deadline<input name="deadline" type="date"></label>` : `
    ${state.projects.length ? `<label>Project<select name="project_id" required>${projectOptions}</select></label>` : '<p class="form-error">Create a project before adding tasks.</p>'}
    <label>Task title<input name="title" required minlength="1" maxlength="160" placeholder="What needs to happen next?"></label>
    <label>Description<textarea name="description" maxlength="5000" placeholder="Add a useful note (optional)"></textarea></label>
    <div class="form-grid"><label>Priority<select name="priority"><option>Low</option><option>Medium</option><option>High</option></select></label>
      <label>Status<select name="status"><option>Pending</option><option>In Progress</option><option>Completed</option></select></label></div>
    <label>Due date<input name="due_date" type="date"></label>`;
  dialog.innerHTML = `<div class="dialog-head"><div><h2>${heading}</h2><p>${isProject ? 'Give the work a name and a clear horizon.' : 'Capture the next step while it is fresh.'}</p></div><button class="dialog-close" type="button" aria-label="Close dialog">&times;</button></div>
    <form class="form-stack" id="record-form">${fields}<p class="form-error" id="dialog-error" role="alert" hidden></p><div class="dialog-actions"><button class="button button-secondary" type="button" data-action="close-dialog">Cancel</button><button class="button button-primary" type="submit" ${!isProject && !state.projects.length ? 'disabled' : ''}>${record ? 'Save changes' : `Create ${isProject ? 'project' : 'task'}`}</button></div></form>`;
  const form = dialog.querySelector('#record-form');
  if (record && form) {
    for (const [field, value] of Object.entries(record)) {
      const input = form.elements.namedItem(field);
      if (input && value != null) input.value = field.endsWith('_date') || field === 'deadline' ? String(value).slice(0, 10) : value;
    }
  }
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    for (const key of ['deadline', 'due_date']) if (!payload[key]) payload[key] = null;
    const errorBox = dialog.querySelector('#dialog-error');
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (!isProject) payload.project_id = parsePositiveInteger(payload.project_id, 'Project');
      const base = isProject ? '/api/projects' : '/api/tasks';
      await api(record ? `${base}/${record.id}` : base, {
        method: record ? 'PUT' : 'POST', body: JSON.stringify(payload),
      });
      dialog.close();
      showToast(`${isProject ? 'Project' : 'Task'} ${record ? 'updated' : 'created'}.`);
      await refreshCurrentPage();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      submit.disabled = false;
    }
  });
  dialog.showModal();
}

async function refreshCurrentPage() {
  const loaders = { dashboard: loadDashboard, projects: loadProjects, project: loadProjectDetail, tasks: loadTasks, profile: loadProfile };
  try {
    await loaders[state.activePage]();
  } catch (error) {
    setLoadingError(error.message);
  }
}

async function updateTaskStatus(taskId, status) {
  taskId = parsePositiveInteger(taskId, 'Task ID');
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  try {
    await api(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({
        project_id: task.project_id, title: task.title, description: task.description,
        priority: task.priority, status, due_date: task.due_date,
      }),
    });
    showToast('Task status updated.');
    await refreshCurrentPage();
  } catch (error) {
    showToast(error.message, true);
    await refreshCurrentPage();
  }
}

function connectActions() {
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'new-project') openRecordDialog('project');
    if (action === 'new-task') {
      if (!state.projects.length) {
        showToast('Create a project before adding a task.', true);
        location.assign('/projects');
        return;
      }
      openRecordDialog('task', state.activePage === 'project' ? { project_id: state.projects[0].id } : null);
    }
    if (action === 'edit-project') {
      const projectId = readActionId(button, 'Project ID');
      if (projectId === null) return;
      const project = state.projects.find((item) => item.id === projectId) || await api(`/api/projects/${projectId}`);
      openRecordDialog('project', project);
    }
    if (action === 'delete-project') {
      const projectId = readActionId(button, 'Project ID');
      if (projectId === null) return;
      const project = state.projects.find((item) => item.id === projectId);
      if (!window.confirm(`Delete "${project?.project_name || 'this project'}" and its tasks? This cannot be undone.`)) return;
      try {
        await api(`/api/projects/${projectId}`, { method: 'DELETE' });
        showToast('Project deleted.');
        if (state.activePage === 'project') location.assign('/projects');
        else await refreshCurrentPage();
      } catch (error) { showToast(error.message, true); }
    }
    if (action === 'edit-task') {
      const taskId = readActionId(button, 'Task ID');
      if (taskId === null) return;
      const task = state.tasks.find((item) => item.id === taskId) || await api(`/api/tasks/${taskId}`);
      openRecordDialog('task', task);
    }
    if (action === 'delete-task') {
      const taskId = readActionId(button, 'Task ID');
      if (taskId === null) return;
      const task = state.tasks.find((item) => item.id === taskId);
      if (!window.confirm(`Delete "${task?.title || 'this task'}"? This cannot be undone.`)) return;
      try {
        await api(`/api/tasks/${taskId}`, { method: 'DELETE' });
        showToast('Task deleted.');
        await refreshCurrentPage();
      } catch (error) { showToast(error.message, true); }
    }
    if (action === 'close-dialog') document.querySelector('#record-dialog').close();
    if (action === 'logout') {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch (error) { showToast(error.message, true); }
      sessionStorage.removeItem(csrfKey);
      location.assign('/login');
    }
    if (action === 'retry') await refreshCurrentPage();
  });
  document.addEventListener('change', (event) => {
    const statusControl = event.target.closest('[data-action="status"]');
    if (statusControl) {
      try {
        updateTaskStatus(parsePositiveInteger(statusControl.dataset.id, 'Task ID'), statusControl.value);
      } catch (error) {
        showToast(error.message, true);
      }
    }
  });
}

async function handleAuthPage(page) {
  const form = document.querySelector('#auth-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = document.querySelector('#form-error');
    const submit = form.querySelector('[type="submit"]');
    errorBox.hidden = true;
    submit.disabled = true;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      if (page === 'register') {
        await api('/api/auth/register', { method: 'POST', body: JSON.stringify(values) });
      }
      const session = await api('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email: values.email, password: values.password }),
      });
      state.csrfToken = session.csrf_token;
      sessionStorage.setItem(csrfKey, session.csrf_token);
      location.assign('/');
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      submit.disabled = false;
    }
  });
}

async function boot() {
  const page = document.body.dataset.page;
  if (page === 'login' || page === 'register') {
    await handleAuthPage(page);
    return;
  }
  state.activePage = page;
  state.csrfToken = sessionStorage.getItem(csrfKey) || '';
  try {
    const session = await api('/api/auth/me');
    state.user = session.user;
    state.csrfToken = session.csrf_token;
    sessionStorage.setItem(csrfKey, state.csrfToken);
    renderSidebar();
    renderTopbar();
    connectActions();
    await refreshCurrentPage();
  } catch {
    sessionStorage.removeItem(csrfKey);
    location.replace('/login');
  }
}

document.addEventListener('DOMContentLoaded', boot);