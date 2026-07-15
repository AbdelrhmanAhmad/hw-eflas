import Anthropic from "@anthropic-ai/sdk";
import { getOptionalUser } from "@/lib/dal";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `أنت محامٍ قانوني متخصص في صياغة المستندات القانونية السعودية وفق نظام الإفلاس (المرسوم الملكي م/50 لعام 1439هـ). مهمتك صياغة فقرات وبنود قانونية باللغة العربية الفصحى الرسمية.

قواعد الصياغة:
- استخدم الأسلوب القانوني الرسمي المعتمد في المحاكم التجارية السعودية
- أبدأ الفقرات بصيغ مناسبة مثل: "حيث إن"، "وإذ إن"، "استناداً إلى"، "بناءً على"
- اذكر المواد القانونية المرتبطة عند الاقتضاء
- اجعل النص مقنعاً وقابلاً للتقديم مباشرة للمحكمة
- الرد يكون النص القانوني المطلوب فقط، بدون مقدمات أو تفسيرات`;

export async function POST(request: Request) {
  const user = await getOptionalUser();
  if (!user) {
    return Response.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return Response.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { prompt, documentType, caseContext } = body;

    if (!prompt) {
      return Response.json({ error: "نص الطلب مطلوب" }, { status: 400 });
    }

    const contextNote = caseContext
      ? `\nسياق الملف: ${caseContext.debtorName || ""} — ${caseContext.crCity || ""} — ديون: ${(caseContext.totalDebts || 0).toLocaleString()} ريال — أصول: ${(caseContext.totalAssets || 0).toLocaleString()} ريال`
      : "";

    const userPrompt = `نوع الوثيقة: ${documentType || "مستند قانوني"}${contextNote}

الطلب: ${prompt}

اكتب الفقرة القانونية المطلوبة بأسلوب قانوني رسمي جاهز للتقديم.`;

    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    return Response.json({ draft: text });
  } catch (err) {
    const message = err instanceof Anthropic.APIError && err.status === 401
      ? "مفتاح Anthropic API غير صالح أو غير مُعرَّف — افتح ملف .env.local وأضف ANTHROPIC_API_KEY حقيقي، ثم أعد تشغيل السيرفر."
      : err instanceof Error ? err.message : "خطأ غير معروف";
    const status = err instanceof Anthropic.APIError ? err.status ?? 500 : 500;
    return Response.json({ error: message }, { status });
  }
}
