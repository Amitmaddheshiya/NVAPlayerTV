(function() {
  const loginForm = document.getElementById('loginForm');
  const deviceIdInput = document.getElementById('deviceId');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');
  const errorMessage = document.getElementById('errorMessage');
  const loading = document.getElementById('loading');

  let deviceId = '';

  // Fetch device ID from server
  async function fetchDeviceId() {
    try {
      const response = await fetch('/status');
      if (!response.ok) {
        throw new Error('Failed to fetch device info');
      }
      const data = await response.json();
      deviceId = data.deviceId || '';
      
      if (deviceId) {
        deviceIdInput.value = deviceId;
        deviceIdInput.disabled = false;
      } else {
        deviceIdInput.value = 'Unable to load Device ID';
        showError('Could not load Device ID. Please refresh the page.');
      }
    } catch (error) {
      console.error('Error fetching device ID:', error);
      deviceIdInput.value = 'Error loading Device ID';
      showError('Failed to load Device ID. Please check your connection.');
    }
  }

  // Show error message
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
  }

  // Hide error message
  function hideError() {
    errorMessage.classList.remove('show');
  }

  // Show loading state
  function showLoading() {
    loading.classList.add('show');
    loginBtn.disabled = true;
  }

  // Hide loading state
  function hideLoading() {
    loading.classList.remove('show');
    loginBtn.disabled = false;
  }

  // Validate password (last 5 digits of device ID)
  function validatePassword(inputPassword) {
    if (!deviceId) return false;
    
    const lastFiveDigits = deviceId.slice(-5);
    return inputPassword === lastFiveDigits;
  }

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();
    hideError();
    
    const password = passwordInput.value.trim();
    
    if (!password) {
      showError('Please enter the password');
      passwordInput.focus();
      return;
    }

    if (password.length !== 5) {
      showError('Password must be exactly 5 digits');
      passwordInput.focus();
      return;
    }

    if (!deviceId) {
      showError('Device ID not loaded. Please refresh the page.');
      return;
    }

    // Validate password locally first
    if (!validatePassword(password)) {
      showError('Invalid password. Please enter the last 5 digits of the Device ID.');
      passwordInput.value = '';
      passwordInput.focus();
      return;
    }

    showLoading();

    try {
      // Send login request to server
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: deviceId,
          password: password
        })
      });

      const data = await response.json();

      if (response.ok && data.authenticated) {
        // Login successful, redirect to CMS
        window.location.href = '/';
      } else {
        hideLoading();
        showError('Login failed. Please check your credentials and try again.');
        passwordInput.value = '';
        passwordInput.focus();
      }
    } catch (error) {
      hideLoading();
      console.error('Login error:', error);
      showError('Login failed. Please check your connection and try again.');
    }
  }

  // Initialize
  function init() {
    // Fetch device ID on page load
    fetchDeviceId();

    // Add form submit handler
    loginForm.addEventListener('submit', handleSubmit);

    // Auto-focus password field when device ID is loaded
    deviceIdInput.addEventListener('change', function() {
      if (this.value && this.value !== 'Unable to load Device ID' && this.value !== 'Error loading Device ID') {
        passwordInput.focus();
      }
    });

    // Allow only digits in password field
    passwordInput.addEventListener('input', function() {
      this.value = this.value.replace(/[^0-9a-fA-F]/g, '');
    });
  }

  // Run initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
