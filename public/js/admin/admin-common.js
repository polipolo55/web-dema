/**
 * Shared admin panel helpers and API client with 401 handling.
 */
let isAdminAuthenticated = false;

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe).replace(/[&<>"]/g, function (m) {
        switch (m) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            default: return m;
        }
    });
}

function showSuccess(message) {
    const el = document.getElementById('successMessage');
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
        setTimeout(function () {
            el.style.display = 'none';
        }, 3000);
    }
}

function showError(message) {
    const el = document.getElementById('errorMessage');
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
        setTimeout(function () {
            el.style.display = 'none';
        }, 3000);
    }
}

function showMessage(message, type) {
    type = type || 'success';
    if (type === 'error') {
        showError(message);
        return;
    }
    showSuccess(message);
}

function setAdminAuthState(authenticated) {
    isAdminAuthenticated = Boolean(authenticated);
    const authSection = document.getElementById('adminAuthSection');
    const authHint = document.getElementById('adminAuthHint');
    const logoutRow = document.getElementById('adminLogoutRow');
    if (authSection) {
        authSection.style.display = isAdminAuthenticated ? 'none' : 'block';
    }
    if (logoutRow) {
        logoutRow.style.display = isAdminAuthenticated ? 'block' : 'none';
    }
    if (authHint) {
        authHint.textContent = isAdminAuthenticated ? 'Sessió activa.' : 'Cal iniciar sessió per desar canvis.';
    }
}

async function apiRequest(url, options) {
    options = options || {};
    const mergedHeaders = options.headers || {};
    if (!(options.body instanceof FormData) && !mergedHeaders['Content-Type']) {
        mergedHeaders['Content-Type'] = 'application/json';
    }
    const response = await fetch(url, {
        method: options.method || 'GET',
        headers: mergedHeaders,
        body: options.body,
        credentials: 'same-origin'
    });
    if (response.status === 401) {
        isAdminAuthenticated = false;
        setAdminAuthState(false);
        showError('Sessió d\'administració invàlida. Torna a iniciar sessió.');
    }
    return response;
}

async function apiUploadRequest(url, formData) {
    return apiRequest(url, {
        method: 'POST',
        body: formData
    });
}
