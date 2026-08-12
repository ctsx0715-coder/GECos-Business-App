import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { formChoices } from "../../create-actions";
import { ProjectForm } from "./project-form";

export default async function NewProjectPage() {
  const session = await withSession(async (s) => s);
  if (!session.permissions.has("projects.project.create")) redirect("/dashboard");

  const { customers, users, wonTendersWithoutProject } = await formChoices();

  return (
    <>
      <div className="mb-4">
        <Link href="/projects" className="text-xs text-muted hover:underline">
          ← Projects
        </Link>
      </div>
      <PageHeader
        title="New project"
        description="Start from a won tender, or from scratch"
      />
      <div className="max-w-3xl">
        <ProjectForm
          customers={customers}
          users={users}
          wonTenders={wonTendersWithoutProject}
        />
      </div>
    </>
  );
}
