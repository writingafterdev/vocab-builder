import fetch from 'node-fetch';

async function runTest() {
  console.log('Fetching local test endpoint...');
  try {
    const res = await fetch('http://localhost:3000/api/test-cascade');
    if (!res.ok) {
        console.error('Server returned:', res.status, res.statusText);
        const text = await res.text();
        console.error(text);
        return;
    }
    const data = await res.json();
    console.dir(data, { depth: null });
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

runTest();
