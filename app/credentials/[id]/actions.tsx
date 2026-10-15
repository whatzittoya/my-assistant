"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { Course, Semester } from "@/types";

type Status = "idle" | "ok" | "error";

export function CredentialActions({
  credentialId,
  initialCourses,
  initialSemesters,
}: {
  credentialId: string;
  initialCourses: Course[];
  initialSemesters: Semester[];
}) {
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [semesters, setSemesters] = useState<Semester[]>(initialSemesters);
  const [selectedSemesterId, setSelectedSemesterId] = useState(
    initialSemesters[0]?.id ?? "all",
  );
  const [loginBusy, setLoginBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [loginStatus, setLoginStatus] = useState<Status>("idle");
  const [coursesBusy, setCoursesBusy] = useState(false);
  const [semesterBusy, setSemesterBusy] = useState(false);
  const [coursesStatus, setCoursesStatus] = useState<Status>(initialCourses.length > 0 ? "ok" : "idle");

  const selectedSemester = semesters.find((semester) => semester.id === selectedSemesterId);
  const visibleCourses = selectedSemester
    ? courses.filter((course) => selectedSemester.courseIds.includes(course.courseId))
    : courses;
  const canRefreshSelectedSemester =
    !selectedSemester || selectedSemester.id === semesters[0]?.id;

  function mergeCourses(nextCourses: Course[]) {
    setCourses((current) => {
      const merged = new Map(current.map((course) => [course.courseId, course]));
      for (const course of nextCourses) merged.set(course.courseId, course);
      return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  async function resetSession() {
    setResetBusy(true);
    try {
      const res = await fetch("/api/actions/reset-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setLoginStatus("idle");
      toast.success("Browser closed — next action relaunches and logs in");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setResetBusy(false);
    }
  }

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
        body: JSON.stringify({
          credentialId,
          semesterId: selectedSemester ? selectedSemester.id : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Collect failed");
      mergeCourses(json.courses);
      setSemesters(json.semesters);
      setCoursesStatus("ok");
      toast.success(`Collected ${json.count} courses`);
    } catch (e) {
      setCoursesStatus("error");
      toast.error(e instanceof Error ? e.message : "Collect failed");
    } finally {
      setCoursesBusy(false);
    }
  }

  async function addSemester() {
    setSemesterBusy(true);
    setCoursesStatus("idle");
    try {
      const res = await fetch("/api/actions/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, createSemester: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not add semester");
      mergeCourses(json.courses);
      setSemesters(json.semesters);
      setSelectedSemesterId(json.selectedSemesterId);
      setCoursesStatus("ok");
      const semester = json.semesters.find(
        (item: Semester) => item.id === json.selectedSemesterId,
      );
      toast.success(`${semester?.name ?? "Semester"} added with ${json.count} courses`);
    } catch (e) {
      setCoursesStatus("error");
      toast.error(e instanceof Error ? e.message : "Could not add semester");
    } finally {
      setSemesterBusy(false);
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
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={runLogin} disabled={loginBusy || resetBusy}>
              {loginBusy ? "Logging in..." : "Run login"}
            </Button>
            <Button
              variant="outline"
              onClick={resetSession}
              disabled={loginBusy || resetBusy}
              title="Close the shared browser — use when a long scrape leaves it stuck"
            >
              {resetBusy ? "Resetting..." : "Reset browser"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Collect course list</CardTitle>
              {coursesStatus === "ok" && (
                <Badge variant="default">{visibleCourses.length} courses</Badge>
              )}
              {coursesStatus === "error" && <Badge variant="destructive">Failed</Badge>}
            </div>
            <CardDescription>
              {canRefreshSelectedSemester ? (
                <>Scrapes <code>/my/courses.php</code>. Reuses open browser session.</>
              ) : (
                "Historical semester snapshots are read-only."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={runCollect}
              disabled={coursesBusy || semesterBusy || !canRefreshSelectedSemester}
            >
              {coursesBusy ? "Collecting..." : "Collect courses"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Semester</p>
              {semesters.length > 0 ? (
                <Select value={selectedSemesterId} onValueChange={setSelectedSemesterId}>
                  <SelectTrigger className="min-w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {semesters.map((semester) => (
                      <SelectItem key={semester.id} value={semester.id}>
                        {semester.name} ({semester.courseIds.length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">Current courses</p>
              )}
            </div>
            <Button
              variant="outline"
              onClick={addSemester}
              disabled={semesterBusy || coursesBusy}
            >
              {semesterBusy ? "Adding semester..." : "Add semester"}
            </Button>
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Courses ({visibleCourses.length})</h2>
            {selectedSemester && (
              <p className="text-sm text-muted-foreground">{selectedSemester.name}</p>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleCourses.map((c) => (
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
              {visibleCourses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No courses in this semester.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
      </div>
    </div>
  );
}
