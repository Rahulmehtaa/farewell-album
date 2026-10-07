const REPOSITORY = 'Rahulmehtaa/farewell-album';
const FILE = 'docs/album.json';
const API = `https://api.github.com/repos/${REPOSITORY}`;

export function encode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}
export function decode(value) {
  return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0)));
}

export function createGithubStore(fetchImpl = fetch) {
  let token = '', sha = '', current = null, writing = false;

  async function request(path, options = {}) {
    const res = await fetchImpl(API + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    if (!res.ok) {
      if (res.status === 409) throw Error('This album changed in another tab. Sign out and sign in again to load the latest version before editing.');
      if (res.status === 401) throw Error('The GitHub token is invalid or expired. Sign out and sign in with a new token.');
      if (res.status === 403 || res.status === 404) throw Error('GitHub could not grant access. Check that your token includes farewell-album and Contents: Read and write. If those are correct, check the GitHub rate limit and try later.');
      throw Error(`GitHub could not save or load the album (${res.status}). Your form has been kept so you can try again.`);
    }
    return res.json();
  }

  return {
    async signIn(value) {
      token = value.trim();
      if (!token) throw Error('Enter your GitHub access token.');
      try {
        const repo = await request('');
        if (!repo.permissions?.push) throw Error('This GitHub account cannot edit the farewell-album repository.');
        const file = await request(`/contents/${FILE}?ref=main`);
        let contents = file.content;
        if (file.encoding !== 'base64') contents = (await request(`/git/blobs/${file.sha}`)).content;
        const next = JSON.parse(decode(contents));
        if (!next.intro || !Array.isArray(next.entries)) throw Error('The album file is not in the expected format.');
        current = next;
        sha = file.sha;
        return structuredClone(current);
      } catch (e) { token = ''; sha = ''; current = null; throw e; }
    },
    signOut() { token = ''; sha = ''; current = null; },
    async save(next, message) {
      if (!token || !sha) throw Error('Sign in before saving.');
      if (writing) throw Error('A save is already in progress. Please wait.');
      const serialized = JSON.stringify(next, null, 2) + '\n';
      if (new TextEncoder().encode(serialized).length > 15_000_000) throw Error('This album has reached its 15 MB photo limit. Remove or use smaller photos before saving.');
      writing = true;
      try {
        const result = await request(`/contents/${FILE}`, {
          method: 'PUT',
          body: JSON.stringify({ message, branch: 'main', sha, content: encode(serialized) })
        });
        sha = result.content.sha;
        current = structuredClone(next);
        return structuredClone(current);
      } finally { writing = false; }
    }
  };
}
