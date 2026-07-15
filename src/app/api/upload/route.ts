import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getOptionalSession } from "@/lib/dal";
import { prisma } from "@/lib/db";

const UPLOADS_ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOADS_DIR ?? "./uploads");
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

export async function POST(request: Request) {
  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const caseId = formData.get("caseId");
  const docType = formData.get("docType");

  if (!(file instanceof File) || typeof caseId !== "string" || !caseId) {
    return Response.json({ error: "بيانات الرفع غير مكتملة" }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "حجم الملف يتجاوز الحد المسموح به (15 ميغابايت)" }, { status: 400 });
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return Response.json({ error: "نوع الملف غير مدعوم — PDF أو JPG أو PNG فقط" }, { status: 400 });
  }

  const targetCase = await prisma.case.findUnique({ where: { id: caseId }, select: { userId: true, clientUserId: true } });
  if (!targetCase || (targetCase.userId !== session.userId && targetCase.clientUserId !== session.userId)) {
    return Response.json({ error: "الملف المطلوب غير موجود" }, { status: 404 });
  }

  // Key by the case's owning admin, not the uploader, so admin and client
  // uploads for the same case land in the same directory tree.
  const caseDir = path.join(UPLOADS_ROOT, targetCase.userId, caseId);
  await mkdir(caseDir, { recursive: true });

  const ext = path.extname(file.name).slice(0, 10);
  const diskName = `${randomUUID()}${ext}`;
  const storagePath = path.join(caseDir, diskName);

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(storagePath, bytes);

  const sizeLabel = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

  const record = await prisma.uploadedFile.create({
    data: {
      caseId,
      name: file.name,
      type: typeof docType === "string" && docType ? docType : "مستند مرفق",
      size: sizeLabel,
      status: "success",
      storagePath,
      mimeType: file.type,
    },
  });

  return Response.json({
    id: record.id,
    name: record.name,
    type: record.type,
    size: record.size,
    status: record.status,
  });
}
