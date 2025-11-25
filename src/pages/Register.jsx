// src/pages/Register.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../App';

export default function Register() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  if (user) {
    navigate('/', { replace: true });
  }

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleRegister = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    setInfoMsg('');

    const { email, password, name } = form;

    // Crea usuario con email/contraseña
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name || '' },
        emailRedirectTo: window.location.origin, // opcional
      },
    });

    setSubmitting(false);

    if (error) {
      setErrorMsg(error.message || 'No se pudo registrar');
      return;
    }

    // Si tu proyecto pide confirmación por email, informa al usuario.
    if (data?.user && !data.session) {
      setInfoMsg('Registro exitoso. Revisa tu correo para confirmar la cuenta.');
      return;
    }

    // Si la sesión viene creada inmediatamente (según tu configuración), entra directo.
    navigate('/', { replace: true });
  };

  return (
    <div style={{ maxWidth: 480, margin: '40px auto' }}>
      <h2>Crear cuenta</h2>
      <form onSubmit={handleRegister} style={{ display: 'grid', gap: 12 }}>
        <label>
          Nombre (opcional)
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={onChange}
            placeholder="Tu nombre"
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={onChange}
            placeholder="tu@correo.com"
            required
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={onChange}
            placeholder="Mínimo 6 caracteres"
            required
            minLength={6}
            style={{ width: '100%', padding: 8 }}
          />
        </label>

        {errorMsg && <div style={{ color: 'crimson', fontSize: 14 }}>{errorMsg}</div>}
        {infoMsg && <div style={{ color: 'seagreen', fontSize: 14 }}>{infoMsg}</div>}

        <button type="submit" disabled={submitting} style={{ padding: 10 }}>
          {submitting ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>

      <div style={{ marginTop: 12, fontSize: 14 }}>
        ¿Ya tienes cuenta? <Link to="/login">Ingresar</Link>
      </div>
    </div>
  );
}
