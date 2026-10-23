// Runs before paint without permitting inline scripts in Content Security Policy.
try {
  const settings = JSON.parse(localStorage.getItem('breadwinner_settings') || '{}');
  if (settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
} catch (_) { /* storage unavailable */ }
