// src/pages/UpdatePassword.jsx
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg('');
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) setMsg(error.message || 'No se pudo actualizar la contraseña');
    else setMsg('✅ Contraseña actualizada correctamente. Ya puedes iniciar sesión.');
  };

  return (
    <div style={{ maxWidth: 420, margin: '40px auto' }}>
      <h2>Actualizar contraseña</h2>
      <form onSubmit={handleUpdate} style={{ display: 'grid', gap: 12 }}>
        <label>Nueva contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        <button type="submit" disabled={submitting} style={{ padding: 10 }}>
          {submitting ? 'Actualizando…' : 'Guardar'}
        </button>
      </form>
      {msg && <div style={{ marginTop: 12, color: '#333' }}>{msg}</div>}
    </div>
  );
}
