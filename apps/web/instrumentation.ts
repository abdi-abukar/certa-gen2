export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeWebEnvironment } = await import('@certa/server/startup');
    initializeWebEnvironment();
  }
}
