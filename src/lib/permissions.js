export const PERMISSIONS = {
  CAN_DELETE_PROJECT: ['admin'],
  CAN_CREATE_PROJECT: ['admin'],
  CAN_VIEW_FINANCIALS: ['admin'],
  CAN_EDIT_PROJECT: ['admin', 'foreman'],
  CAN_UPDATE_STATUS: ['admin', 'foreman'],
  CAN_MANAGE_CREW: ['admin', 'foreman'],
}

/**
 * Checks if a user role has permission to perform an action
 * @param {string} role - The user's role (admin, foreman, crew)
 * @param {string[]} allowedRoles - List of roles allowed to do this
 */
export const can = (role, allowedRoles) => {
  if (!role) return false
  return allowedRoles.includes(role)
}