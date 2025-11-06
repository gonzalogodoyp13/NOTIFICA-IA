# NOTIFICA IA - Phase 0

Initial skeleton for the SaaS application "NOTIFICA IA". Management system for Receiver Offices.

## 🚀 Tech Stack

- **Next.js 14** (App Router) with TypeScript
- **Prisma ORM** connected to PostgreSQL (Railway)
- **Supabase Auth** for authentication (email + password, via HTTPS API)
- **TailwindCSS** for styling
- **pdf-lib** (placeholder for future functionality)
- Deployment on **Vercel**

## 📋 Prerequisites

- Node.js 18+ installed
- Railway account with PostgreSQL database created
- Supabase account (free) for authentication
- NPM or Yarn

## ⚙️ Configuración Inicial

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto (copia de `.env.example`):

```env
DATABASE_URL="postgresql://user:password@host:port/database"
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key-here"
```

**Obtener DATABASE_URL desde Railway:**
1. Ve a tu proyecto en Railway
2. Selecciona la base de datos PostgreSQL
3. Ve a la pestaña "Variables"
4. Copia la variable `DATABASE_URL` o `POSTGRES_URL`

**Configurar Supabase Auth (solo autenticación, sin migrar la base de datos):**
1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratuita
2. Crea un nuevo proyecto (puede ser un proyecto mínimo, solo para Auth)
3. Ve a **Project Settings** → **API**
4. Copia los siguientes valores:
   - **Project URL** → pégalo en `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → pégalo en `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. La base de datos PostgreSQL sigue en Railway (no se migra a Supabase)
6. La autenticación usa la API HTTPS de Supabase (IPv4 seguro, evita problemas IPv6 desde Chile)

### 3. Generar Prisma Client

```bash
npm run db:generate
```

### 4. Crear tablas en la base de datos

```bash
npm run db:push
```

This will create the `users` table in your PostgreSQL database.

## 🏃 Ejecutar Localmente

### Modo desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

### Verificar API

Visita [http://localhost:3000/api/ping](http://localhost:3000/api/ping) - deberías ver `{"ok":true}`

### Probar Autenticación

1. Visita [http://localhost:3000/login](http://localhost:3000/login)
2. Crea un usuario en Supabase:
   - Ve a tu proyecto en Supabase Dashboard
   - Ve a **Authentication** → **Users**
   - Haz clic en **Add user** → **Create new user**
   - Ingresa un email y contraseña
3. Inicia sesión con esas credenciales en `/login`
4. Serás redirigido a `/dashboard` después del login exitoso

## 📁 Project Structure

```
├── app/                 # Next.js App Router
│   ├── api/            # API routes
│   │   └── ping/       # Health check endpoint
│   ├── login/          # Login page (authentication)
│   ├── dashboard/      # Protected dashboard (requires authentication)
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Homepage
├── components/          # React components
│   └── Navbar.tsx      # Navigation bar
├── lib/                # Utility libraries
│   ├── prisma.ts       # Prisma Client instance
│   ├── supabaseClient.ts  # Supabase client initialization
│   └── auth.ts         # Authentication utilities (getSession, requireSession)
├── prisma/             # Database schema
│   └── schema.prisma   # User model definition
└── package.json        # Dependencies
```

## 🗄️ Data Model

### User (Usuario)

Each account represents a "Receiver Office" (Oficina de Receptor).

- `id`: Unique identifier (CUID)
- `email`: Unique user email
- `officeName`: Office name
- `createdAt`: Creation date (automatic)

## 📝 Available Commands

```bash
# Development
npm run dev          # Start development server

# Database
npm run db:generate  # Generate Prisma Client
npm run db:push      # Sync schema with DB (no migrations)
npm run db:migrate   # Create migration and apply changes
npm run db:studio    # Open Prisma Studio (GUI for DB)

# Production
npm run build        # Build for production
npm start            # Start production server
```

## 🔐 Supabase Authentication

The project uses **Supabase Auth** for user authentication:

- ✅ **Authentication**: Performed via Supabase HTTPS API (no direct database connection)
- ✅ **Database**: Remains on Railway PostgreSQL (not migrated)
- ✅ **IPv4 safe**: Avoids IPv6 issues from Chile
- ✅ **Protected routes**: Uses `requireSession()` to protect pages like `/dashboard`

### Authentication Functions

- `getSession()`: Gets the current user session (returns `{ email }` or `null`)
- `requireSession()`: Requires authentication, redirects to `/login` if not authenticated
- `signIn(email, password)`: Signs in with email and password
- `signOut()`: Signs out the current user

## 📦 Despliegue en Vercel

1. Conecta tu repositorio a Vercel
2. Agrega la variable de entorno `DATABASE_URL` en la configuración de Vercel
3. Vercel detectará Next.js y desplegará automáticamente

## 🎯 Next Steps (Phase 1+)

- ✅ User authentication (implemented)
- ✅ Main dashboard (implemented)
- Document management functionality
- pdf-lib integration
- Role and permission system
- New user registration

## 📄 License

Private - NOTIFICA IA

