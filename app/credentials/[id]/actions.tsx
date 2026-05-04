"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { Course } from "@/types";

type Status = "idle" | "ok" | "error";

export function CredentialActions({
  credentialId,
  initialCourses,
}: {
  credentialId: string;
  initialCourses: Course[];
}) {
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginStatus, setLoginStatus] = useState<Status>("idle");
  const [coursesBusy, setCoursesBusy] = useState(false);
  const [coursesStatus, setCoursesStatus] = useState<Status>(initialCourses.length > 0 ? "ok" : "idle");

  async function runLogin() {
    setLoginBusy(true);
    setLoginStatus("idle");
    try {
      const res = await fetch("/api/actions/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Login failed");
      setLoginStatus("ok");
      toast.success(json.alreadyLoggedIn ? "Already logged in" : "Login successful");
    } catch (e) {
      setLoginStatus("error");
      toast.error(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoginBusy(false);
    }
  }

  async function runCollect() {
    setCoursesBusy(true);
    setCoursesStatus("idle");
    try {
      const res = await fetch("/api/actions/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Collect failed");
      setCourses(json.courses);
      setCoursesStatus("ok");
      toast.success(`Collected ${json.count} courses`);
    } catch (e) {
      setCoursesStatus("error");
      toast.error(e instanceof Error ? e.message : "Collect failed");
    } finally {
      setCoursesBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Open UT &amp; login</CardTitle>
              {loginStatus === "ok" && <Badge variant="default">Logged in</Badge>}
              {loginStatus === "error" && <Badge variant="destructive">Failed</Badge>}
            </div>
            <CardDescription>
              Opens browser and signs in. Same window reused on repeat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={runLogin} disabled={loginBusy}>
              {loginBusy ? "Logging in..." : "Run login"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Collect course list</CardTitle>
              {coursesStatus === "ok" && (
                <Badge variant="default">{courses.length} courses</Badge>
              )}
              {coursesStatus === "error" && <Badge variant="destructive">Failed</Badge>}
            </div>
            <CardDescription>
              Scrapes <code>/my/courses.php</code>. Reuses open browser session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={runCollect} disabled={coursesBusy}>
              {coursesBusy ? "Collecting..." : "Collect courses"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {courses.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Courses ({courses.length})</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((c) => (
                <TableRow key={c.courseId}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/credentials/${credentialId}/courses/${c.courseId}`}
                      className="hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.courseId}</TableCell>
                  <TableCell>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline text-sm"
                    >
                      UT ↗
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
