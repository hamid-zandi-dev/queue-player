const src = new URLSearchParams(location.search).get('src') || '';

function trackName(url) {
  const last = url.split(/[?#]/)[0].split('/').pop() || '';
  try {
    return decodeURIComponent(last) || 'Track';
  } catch {
    return last || 'Track';
  }
}

const name = trackName(src);
document.title = name;
document.getElementById('name').textContent = name;
document.getElementById('source').textContent = src;
document.getElementById('audio').src = src;
