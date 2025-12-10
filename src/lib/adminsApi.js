// src/pages/AdminsPage.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  listAdmins,
  inviteAdmin,
  inviteIndependentOwner,
  updateAdmin,
  deleteAdmin,
} from "../lib/adminsApi";
import { supabase } from "../supabaseClient";

export default function AdminsPage() {
  const { currentOrg, isOwner, user } = useAuth();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");

  // ===========================================================
  // Cargar administradores ACTUALES de la org en sesión
  // ===========================================================
  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    if (!currentOrg?.id) {
      setError("No se encontró la organización actual.");
      setLoading(false);
      return;
    }

    const fetchAdmins = async () => {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);

      const { data, error: fetchError } = await listAdmins(currentOrg.id);

      if (fetchError) {
        console.error("[AdminsPage] listAdmins error:", fetchError);
        setError(
          fetchError.message ||
            "No se pudo cargar la lista de administradores."
        );
      } else {
        setAdmins(data || []);
      }
      setLoading(false);
    };

    fetchAdmins();
  }, [currentOrg?.id, isOwner]);

  // ===========================================================
  // Refresh manual
  // ===========================================================
  const handleRefresh = async () => {
    if (!currentOrg?.id || !isOwner) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const { data, error: fetchError } = await listAdmins(currentOrg.id);
    if (fetchError) {
      console.error("[AdminsPage] listAdmins error:", fetchError);
      setError(
        fetchError.message ||
          "No se pudo actualizar la lista de administradores."
      );
    } else {
      setAdmins(data || []);
    }
    setLoading(false);
  };

  // ===========================================================
  // INVITAR NUEVO ADMINISTRADOR
  // ===========================================================
  const handleInviteSubmit = async (e) => {
    e.preventDefault();

    const email = inviteEmail.trim();
    setError(null);
    setSuccessMessage(null);

    if (!email) {
      setError("Ingre
