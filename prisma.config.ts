import { defineConfig } from 'prisma/config'

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
  datasource: {
    url: 'postgresql://neondb_owner:npg_a5SimlWR3ZJy@ep-crimson-scene-agvjvw3e.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require'
  }
})
