const signupForm = document.getElementById('signupForm');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const authResult = document.getElementById('authResult');
const authState = document.getElementById('authState');

const tributeForm = document.getElementById('tributeForm');
const deliveryForm = document.getElementById('deliveryForm');
const orderResult = document.getElementById('orderResult');
const deliveryResult = document.getElementById('deliveryResult');
const photosInput = document.getElementById('photos');
const photoCounter = document.getElementById('photoCounter');
const orderCard = document.getElementById('order-card');

function showResult(el, msg, isError = false) {
  el.classList.remove('hidden');
  el.innerHTML = isError ? `<strong>Error:</strong> ${msg}` : msg;
}

async function refreshAuth() {
  const resp = await fetch('/api/auth/me');
  const data = await resp.json();
  const user = data.user;

  if (user) {
    authState.textContent = `Logged in as ${user.contactName} (${user.funeralHomeName})`;
    orderCard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
  } else {
    authState.textContent = 'Not logged in.';
    orderCard.classList.add('hidden');
    logoutBtn.classList.add('hidden');
  }
}

signupForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(signupForm).entries());

  const resp = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await resp.json();

  if (!resp.ok) return showResult(authResult, data.error || 'Signup failed', true);
  showResult(authResult, 'Account created and logged in. You can now submit tribute orders.');
  signupForm.reset();
  await refreshAuth();
});

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(loginForm).entries());

  const resp = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await resp.json();

  if (!resp.ok) return showResult(authResult, data.error || 'Login failed', true);
  showResult(authResult, 'Login successful.');
  loginForm.reset();
  await refreshAuth();
});

logoutBtn?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  showResult(authResult, 'Logged out.');
  await refreshAuth();
});

if (photosInput) {
  photosInput.addEventListener('change', () => {
    const count = photosInput.files.length;
    if (count > 40) {
      alert('Please upload a maximum of 40 photos.');
      photosInput.value = '';
      photoCounter.textContent = '0 / 40 photos selected';
      return;
    }
    photoCounter.textContent = `${count} / 40 photos selected`;
  });
}

tributeForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(tributeForm);
  const photoCount = (formData.getAll('photos') || []).filter(Boolean).length;
  if (photoCount > 40) {
    alert('Please upload a maximum of 40 photos.');
    return;
  }

  const resp = await fetch('/api/orders', { method: 'POST', body: formData });
  const data = await resp.json();

  if (!resp.ok) return showResult(orderResult, data.error || 'Unable to submit order.', true);

  showResult(
    orderResult,
    `
      <p><strong>Order submitted successfully.</strong></p>
      <p>Order ID: <code>${data.orderId}</code></p>
      <p>Photos uploaded: ${data.photoCount}</p>
      <p><a class="button" target="_blank" rel="noopener noreferrer" href="${data.paypalLink}">Complete $299 PayPal Payment</a></p>
    `
  );

  tributeForm.reset();
  photoCounter.textContent = '0 / 40 photos selected';
});

deliveryForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(deliveryForm);
  const adminKey = formData.get('adminKey');

  const resp = await fetch('/api/deliveries', {
    method: 'POST',
    headers: { 'x-admin-key': adminKey },
    body: formData
  });

  const data = await resp.json();
  if (!resp.ok) return showResult(deliveryResult, data.error || 'Unable to upload video.', true);

  showResult(
    deliveryResult,
    `
      <p><strong>Video uploaded.</strong></p>
      <p>Secure Delivery Link:</p>
      <p><a href="${data.watchLink}" target="_blank" rel="noopener noreferrer">${data.watchLink}</a></p>
      <p>Expires: ${new Date(data.expiresAt).toLocaleString()}</p>
    `
  );

  deliveryForm.reset();
});

refreshAuth();
