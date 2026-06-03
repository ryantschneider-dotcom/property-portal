import { promises as fs } from "fs";
import path from "path";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";

const uploadsDir = path.join(process.cwd(), "data", "uploads");
const resolvedUploadsDir = path.resolve(uploadsDir);

function contentDispositionFilename(name: string) {
  return name.replace(/[\\"\r\n]/g, "_");
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const cookieStore = await cookies();
  const isAuthenticated = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await context.params;
  const filePath = path.resolve(uploadsDir, name);

  if (filePath !== resolvedUploadsDir && !filePath.startsWith(`${resolvedUploadsDir}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  try {
    const file = await fs.readFile(filePath);

    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `inline; filename="${contentDispositionFilename(path.basename(name))}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
