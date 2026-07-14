import { NextRequest, NextResponse } from "next/server";

import {
  getPublicDatabaseSettings,
  patchDatabaseSettings,
  resolveDatabaseMode,
  type DatabaseMode,
} from "@/lib/settings/database";

export async function GET() {
  const database = await getPublicDatabaseSettings();
  return NextResponse.json({ database });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    supabase_url?: string;
    anon_key?: string;
    service_role_key?: string;
    db_password?: string;
    clear_service_role_key?: boolean;
    clear_db_password?: boolean;
    mode?: DatabaseMode;
  };

  const database = await patchDatabaseSettings(body);
  return NextResponse.json({ database });
}
