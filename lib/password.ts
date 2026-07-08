export const PASSWORD_REQUIREMENTS = [
  { id: 'length', label: 'Pelo menos 10 caracteres', test: (value: string) => value.length >= 10 },
  { id: 'lowercase', label: 'Uma letra minúscula', test: (value: string) => /[a-z]/.test(value) },
  { id: 'uppercase', label: 'Uma letra maiúscula', test: (value: string) => /[A-Z]/.test(value) },
  { id: 'number', label: 'Um número', test: (value: string) => /\d/.test(value) },
  { id: 'special', label: 'Um caractere especial', test: (value: string) => /[^A-Za-z0-9\s]/.test(value) },
  { id: 'spaces', label: 'Sem espaços', test: (value: string) => !/\s/.test(value) },
] as const

export function passwordChecks(password: string) {
  return PASSWORD_REQUIREMENTS.map((requirement) => ({
    id: requirement.id,
    label: requirement.label,
    met: requirement.test(password),
  }))
}

export function isStrongPassword(password: string) {
  return PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password))
}
