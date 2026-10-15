"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import type { RubrikFile } from "@/types";

function fileUrl(localPath: string): string {
  return `/api/rubrik/file?path=${encodeURIComponent(localPath)}`;
}

export function RubrikCard({
  credentialId,
  courseId,
  forumId,
  initialFiles,
}: {
  credentialId: string;
  courseId: string;
  forumId: string;
  initialFiles: RubrikFile[];
}) {
  const [files, setFiles] = useState<RubrikFile[]>(initialFiles);
  const [busy, setBusy] = useState(false);

  async function collect() {
    setBusy(true);
    try {
      const res = await fetch("/api/actions/rubrik-diskusi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, forumId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed");

      setFiles(json.files ?? []);
      if ((json.files?.length ?? 0) === 0) {
        toast.warning("No rubrik found in this session");
      } else {
        toast.success(`Collected ${json.files.length} rubrik file(s)`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Rubrik diskusi</CardTitle>
          <Button onClick={collect} disabled={busy} variant="outline" size="sm">
            {busy ? "Collecting..." : files.length > 0 ? "Refresh rubrik" : "Collect rubrik"}
          </Button>
        </div>
        <CardDescription>
          Downloads the &ldquo;Rubrik&rdquo; file from this session on UT. Word files are converted
          to PDF so they can be read here.
        </CardDescription>
      </CardHeader>

      {files.length > 0 && (
        <CardContent className="space-y-6">
          {files.map((f) => (
            <div key={f.localPath} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{f.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <a href={fileUrl(f.localPath)} target="_blank" rel="noreferrer" className="hover:text-foreground">
                    Open file ↗
                  </a>
                  {f.url && (
                    <a href={f.url} target="_blank" rel="noreferrer" className="hover:text-foreground">
                      On UT ↗
                    </a>
                  )}
                </div>
              </div>
              {f.filename.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={`${fileUrl(f.localPath)}#view=FitH`}
                  title={f.name}
                  className="h-[700px] w-full rounded-md border"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {f.filename} — not previewable, use the link above.
                </p>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
