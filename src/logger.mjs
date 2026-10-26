function timestamp() {
  return new Date().toISOString();
}

export function createLogger(stream = process.stdout) {
  return {
    info(message) {
      stream.write(`[${timestamp()}] INFO ${message}\n`);
    },
    error(message, error) {
      const detail = error ? `: ${error.message || error}` : "";
      stream.write(`[${timestamp()}] ERROR ${message}${detail}\n`);
    },
  };
}
