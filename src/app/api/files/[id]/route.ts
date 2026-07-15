import { readFile } from "fs/promises";
import { getOptionalSession } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession();
  if (!session) {
    return new Response(null, { status: 401 });
  }
  const { id } = await ctx.params;

  const file = await prisma.uploadedFile.findUnique({
    where: { id },
    include: { case: { select: { userId: true, clientUserId: true } } },
  });

  if (!file || (file.case.userId !== session.userId && file.case.clientUserId !== session.userId)) {
    return new Response(null, { status: 404 });
  }

  try {
    const bytes = await readFile(file.storagePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
