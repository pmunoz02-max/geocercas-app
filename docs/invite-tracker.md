# Invite Tracker Flow

## Regla crítica
El sistema NO permite invitar trackers si no existe un registro previo en `personal`.

## Flujo
1. Resolver `personal_id` (assignment_id o email)
2. Validar que exista en la org
3. Invitar usuario
4. Sincronizar:
   personal.user_id = auth.users.id

## Reglas
personal.user_id == auth.users.id == tracker_positions.user_id

## Errores
- personal_not_found_for_invite (400)
- personal_user_id_conflict (409)