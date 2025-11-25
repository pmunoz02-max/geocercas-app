// src/pages/Errors/NotAuthorized.jsx
export default function NotAuthorized() {
  return (
    <div className="p-10 text-center">
      <h1 className="text-3xl font-bold mb-3 text-red-600">Acceso denegado</h1>
      <p className="text-gray-600">
        No tienes permisos para acceder a esta sección. Contacta al administrador si crees que es un error.
      </p>
    </div>
  );
}
