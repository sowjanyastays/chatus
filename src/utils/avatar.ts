const COLORS = [
  '#FF6B6B', '#FF8E53', '#FFB347', '#26C6DA',
  '#66BB6A', '#42A5F5', '#7E57C2', '#EC407A',
  '#AB47BC', '#26A69A',
];

export function getAvatarColor(name: string): string {
  if (!name) return '#6C63FF';
  return COLORS[name.charCodeAt(0) % COLORS.length];
}

export function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase();
}
