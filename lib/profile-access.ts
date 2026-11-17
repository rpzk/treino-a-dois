/** Profile binding checks for an authenticated FitCore session (no DB I/O). */

export function assertProfileAllowed(
  requested: string | null | undefined,
  linked: string | null,
): Response | null {
  if (!requested) {
    return Response.json({ error: "Perfil inválido." }, { status: 400 });
  }
  if (!linked) {
    return Response.json(
      {
        error: "Perfil de treino ainda não vinculado a este paciente.",
        code: "PROFILE_NOT_LINKED",
        patient_fhir_id: true,
      },
      { status: 404 },
    );
  }
  if (requested !== linked) {
    return Response.json({ error: "Perfil não autorizado para esta sessão." }, { status: 403 });
  }
  return null;
}
