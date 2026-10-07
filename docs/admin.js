import { createGithubStore } from './github-store.mjs';

const $ = selector => document.querySelector(selector);
const store = createGithubStore();
let album = null, photo = '', busy = false, photoGeneration = 0;
const savedMessage = 'Saved to GitHub. Your public album will update after GitHub Pages finishes publishing, usually in a minute or two.';

function notice(message, error = false) {
  $('#notice').textContent = message;
  $('#notice').className = error ? 'error' : 'notice';
}
function setBusy(value) {
  busy = value;
  for (const control of document.querySelectorAll('#workspace button, #workspace input, #workspace textarea, #logout')) control.disabled = value;
}
function preview() {
  $('#photo-preview').hidden = !photo;
  $('#remove-photo').hidden = !photo;
  if (photo) $('#photo-preview').src = photo;
  else $('#photo-preview').removeAttribute('src');
}
function clearForm() {
  photoGeneration++;
  $('#entry-form').reset();
  $('#entry-id').value = '';
  photo = '';
  preview();
  $('#form-title').textContent = 'Add a colleague';
}
function show(signedIn) {
  $('#login').hidden = signedIn;
  $('#workspace').hidden = !signedIn;
  $('#logout').hidden = !signedIn;
}
function render() {
  for (const key of ['title', 'letter', 'signature']) $('#intro-' + key).value = album.intro[key];
  $('#total').textContent = `${album.entries.length} saved`;
  const list = $('#entries');
  list.replaceChildren();
  if (!album.entries.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Add your first colleague above. The sample notes will disappear when your first note is published.';
    list.append(empty);
  }
  for (const entry of album.entries) {
    const row = document.createElement('div');
    row.className = 'admin-row';
    if (entry.photo) {
      const img = document.createElement('img');
      img.src = entry.photo;
      img.alt = entry.name;
      row.append(img);
    }
    const text = document.createElement('div');
    text.className = 'row-text';
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const role = document.createElement('p');
    role.textContent = entry.role;
    text.append(name, role);
    const edit = document.createElement('button');
    edit.className = 'secondary';
    edit.textContent = 'Edit';
    edit.onclick = () => {
      photoGeneration++;
      for (const key of ['name', 'role', 'message']) $('#' + key).value = entry[key];
      $('#entry-id').value = entry.id;
      $('#photo').value = '';
      photo = entry.photo;
      preview();
      $('#form-title').textContent = 'Edit your note';
      $('#name').focus();
    };
    const remove = document.createElement('button');
    remove.className = 'danger';
    remove.textContent = 'Delete';
    remove.onclick = async () => {
      if (busy || !confirm(`Remove the note for ${entry.name} from your public album? Earlier versions remain in GitHub history.`)) return;
      const next = structuredClone(album);
      next.entries = next.entries.filter(item => item.id !== entry.id);
      if (await save(next, `Remove farewell note for ${entry.name}`)) {
        if ($('#entry-id').value === entry.id) clearForm();
      }
    };
    row.append(text, edit, remove);
    list.append(row);
  }
}
async function save(next, commitMessage) {
  setBusy(true);
  notice('Saving your changes to GitHub…');
  try {
    album = await store.save(next, commitMessage);
    render();
    notice(savedMessage);
    return true;
  } catch (error) {
    notice(error.message || 'Could not confirm the save. Sign in again to check the latest album before retrying.', true);
    return false;
  } finally { setBusy(false); }
}
$('#login').onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  notice('Checking your GitHub access…');
  const token = $('#password').value;
  $('#password').value = '';
  try {
    album = await store.signIn(token);
    render();
    show(true);
    notice('Connected to your GitHub album. Saved changes are published for everyone.');
  } catch (error) { notice(error.message, true); }
  finally { button.disabled = false; }
};
$('#logout').onclick = () => {
  if (busy) return;
  store.signOut();
  album = null;
  clearForm();
  $('#intro-form').reset();
  $('#entries').replaceChildren();
  show(false);
  notice('Signed out. Your token has been cleared from this tab.');
};
$('#cancel').onclick = clearForm;
$('#remove-photo').onclick = () => { photoGeneration++; photo = ''; $('#photo').value = ''; preview(); };

$('#photo').onchange = async () => {
  const file = $('#photo').files[0];
  if (!file) return;
  const generation = ++photoGeneration;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10_000_000) {
    $('#photo').value = '';
    return notice('Choose a JPG, PNG, or WebP photo smaller than 10 MB.', true);
  }
  setBusy(true);
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/jpeg', 0.82);
    if (data.length > 600000) data = canvas.toDataURL('image/jpeg', 0.6);
    if (data.length > 800000) throw Error('Choose a smaller or less detailed photo.');
    if (generation !== photoGeneration) return;
    photo = data;
    preview();
    notice('Photo ready. Save the note to publish it.');
  } catch (error) { $('#photo').value = ''; notice(error.message || 'This photo could not be read.', true); }
  finally { URL.revokeObjectURL(objectUrl); setBusy(false); }
};
$('#entry-form').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  const name = $('#name').value.trim(), message = $('#message').value.trim();
  if (!name || !message) return notice('Enter a name and a farewell message.', true);
  const id = $('#entry-id').value;
  const entry = { id: id || crypto.randomUUID(), name, role: $('#role').value.trim(), message, photo, created: id ? album.entries.find(e => e.id === id).created : Date.now() };
  const next = structuredClone(album);
  if (id) next.entries = next.entries.map(item => item.id === id ? entry : item);
  else next.entries.unshift(entry);
  if (await save(next, `${id ? 'Update' : 'Add'} farewell note for ${name}`)) clearForm();
};
$('#intro-form').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  const intro = {};
  for (const key of ['title', 'letter', 'signature']) {
    intro[key] = $('#intro-' + key).value.trim();
    if (!intro[key]) return notice('Complete each introduction field before saving.', true);
  }
  const next = structuredClone(album);
  next.intro = intro;
  await save(next, 'Update farewell introduction');
};
window.addEventListener('beforeunload', event => {
  if (busy) { event.preventDefault(); event.returnValue = ''; }
});
