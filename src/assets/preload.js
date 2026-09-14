(() => {
  const mem = new Map();

  async function fetchToMemory(url, { signal } = {}) {
    if (mem.has(url)) return mem.get(url);

    const res = await fetch(url, { cache: 'force-cache', signal });
    if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const entry = { blob, objectUrl, bytes: blob.size };
    mem.set(url, entry);
    return entry;
  }

  async function decodeImageObjectUrl(objectUrl) {
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = objectUrl;
    if (img.decode) {
      await img.decode();
    } else {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
    }
    return true;
  }

  async function prewarmImages(urls, { concurrency = 2, onProgress } = {}) {
    let done = 0;
    const queue = urls.slice();

    async function worker() {
      while (queue.length) {
        const url = queue.shift();
        const entry = await fetchToMemory(url);
        await decodeImageObjectUrl(entry.objectUrl);
        done++;
        onProgress?.(done, urls.length, url, entry.bytes);
      }
    }

    const workers = Array.from({ length: Math.max(1, concurrency) }, worker);
    await Promise.all(workers);
    return true;
  }

  async function prewarmFiles(urls, { concurrency = 2, onProgress } = {}) {
    let done = 0;
    const queue = urls.slice();

    async function worker() {
      while (queue.length) {
        const url = queue.shift();
        const entry = await fetchToMemory(url);
        done++;
        onProgress?.(done, urls.length, url, entry.bytes);
      }
    }

    const workers = Array.from({ length: Math.max(1, concurrency) }, worker);
    await Promise.all(workers);
    return true;
  }

  window.__mfMemAssets = {
    has: (url) => mem.has(url),
    getObjectUrl: (url) => mem.get(url)?.objectUrl || url,
    getBlob: (url) => mem.get(url)?.blob || null,
    prewarmImages,
    prewarmFiles,
  };
})();
