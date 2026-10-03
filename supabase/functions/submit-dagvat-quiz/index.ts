import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://sajidaturseb.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function respond(request: Request, body: unknown, status = 200) {
  const origin = request.headers.get("origin") ?? "";
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://sajidaturseb.github.io",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-teacher-pin",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Vary": "Origin",
    },
  });
}

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function integer(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error("invalid_number");
  return n;
}

function normalize(raw: Record<string, unknown>) {
  const studentName = text(raw.studentName, 80);
  const studentGroup = text(raw.group, 60);
  const lessonTitle = text(raw.lessonTitle, 160);
  const attemptId = text(raw.attemptId, 80);
  const openQuestion = text(raw.openQuestion, 1000);
  const openAnswer = text(raw.openAnswer, 5000);
  const lessonId = integer(raw.lessonId, 1, 25);
  const score = integer(raw.score, 0, 6);
  const total = integer(raw.total, 6, 6);
  const durationSeconds = integer(raw.durationSeconds, 1, 86400);
  if (!studentName || !studentGroup || !lessonTitle || !attemptId || !openQuestion || !openAnswer) throw new Error("invalid_attempt");
  if (!Array.isArray(raw.answers) || raw.answers.length !== 6) throw new Error("invalid_answers");
  const answers = raw.answers.map((value, index) => {
    const answer = value as Record<string, unknown>;
    return {
      number: index + 1,
      selected: integer(answer.selected, 0, 2),
      correct: integer(answer.correct, 0, 2),
      isCorrect: integer(answer.selected, 0, 2) === integer(answer.correct, 0, 2),
    };
  });
  if (score !== answers.filter(answer => answer.isCorrect).length) throw new Error("invalid_score");
  return {
    student_name: studentName,
    student_group: studentGroup,
    lesson_id: lessonId,
    lesson_title: lessonTitle,
    score,
    total,
    percent: Math.round(score / total * 100),
    duration_seconds: durationSeconds,
    attempt_id: attemptId,
    answers,
    open_question: openQuestion,
    open_answer: openAnswer,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return respond(request, { ok: true });
  if (request.method !== "POST") return respond(request, { ok: false, error: "method_not_allowed" }, 405);
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return respond(request, { ok: false, error: "invalid_json" }, 400); }

  if (body.action === "list") {
    const teacherPin = Deno.env.get("TEACHER_PIN") ?? "";
    if (!teacherPin || request.headers.get("x-teacher-pin") !== teacherPin) {
      return respond(request, { ok: false, error: "invalid_pin" }, 401);
    }
    const { data, error } = await supabase.from("dagvat_quiz_attempts")
      .select("submitted_at,student_name,student_group,lesson_id,lesson_title,score,total,percent,duration_seconds,answers,open_question,open_answer")
      .order("submitted_at", { ascending: false }).limit(5000);
    if (error) { console.error(error); return respond(request, { ok: false, error: "database_error" }, 500); }
    return respond(request, { ok: true, results: data });
  }

  let record;
  try { record = normalize(body); }
  catch { return respond(request, { ok: false, error: "invalid_request" }, 400); }
  const { error } = await supabase.from("dagvat_quiz_attempts").upsert(record, {
    onConflict: "attempt_id", ignoreDuplicates: true,
  });
  if (error) { console.error(error); return respond(request, { ok: false, error: "database_error" }, 500); }
  return respond(request, { ok: true }, 201);
});
