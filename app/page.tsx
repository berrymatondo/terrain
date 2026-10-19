import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ProjectDashboard } from '@/components/project-dashboard'
import { getCurrentUser } from '@/lib/auth'
import { getAssignableUsers, getDatabase, getMembers, getNotifications, getUsers } from '@/lib/db'
import { canEdit, canManageUsers } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const editor = canEdit(user.role)
  const [{ prospects, actions }, users, assignableUsers, members, notifications, cookieStore] = await Promise.all([
    getDatabase(user),
    canManageUsers(user.role) ? getUsers() : null,
    editor ? getAssignableUsers() : [],
    editor ? getMembers() : [],
    getNotifications(user.id),
    cookies(),
  ])

  return (
    <ProjectDashboard
      prospects={prospects}
      actions={actions}
      currentUser={user}
      users={users}
      assignableUsers={assignableUsers}
      members={members}
      notifications={notifications}
      initialCollapsed={cookieStore.get('sidebar-collapsed')?.value === '1'}
    />
  )
}
