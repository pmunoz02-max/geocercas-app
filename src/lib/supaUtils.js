// src/lib/supaUtils.js
export function assertNoError(tag, { error, data }) {
  if (error) {
    // PostgREST 400 suele traer details/hint. Log utilísimo para depurar.
    console.error(`[${tag}]`, {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }
  return data;
}
