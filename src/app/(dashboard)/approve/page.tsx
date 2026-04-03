"use client"

import React, { useState, useMemo } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { StatusBadge, Button, Card } from "@/components/ui"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Department {
  id: string
  name: string
}

interface DayEntry {
  date: number
  fullDate: string
  dayShort: string
  workType: string
  description: string
  status: "none" | "approved" | "pending" | "rejected"
}

interface EmployeeRequest {
  id: string
  employeeName: string
  department: string
  departmentId: string
  avatarInitials: string
  weekLabel: string
  weekRange: string
  days: DayEntry[]
  status: "none" | "approved" | "pending" | "rejected"
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const departments: Department[] = [
  { id: "all", name: "全部署" },
  { id: "eng", name: "エンジニアリング第1チーム" },
  { id: "design", name: "UI/UXデザイン" },
  { id: "sys", name: "システムエンジニア" },
  { id: "hr", name: "人事部" },
]

const mockRequests: EmployeeRequest[] = [
  {
    id: "1",
    employeeName: "佐藤 健一",
    department: "エンジニアリング第1チーム",
    departmentId: "eng",
    avatarInitials: "佐",
    weekLabel: "第13週",
    weekRange: "2026/03/22 - 03/28",
    status: "pending",
    days: [
      {
        date: 23,
        fullDate: "2026/03/23",
        dayShort: "(月)",
        workType: "在宅勤務",
        description: "社内Redmineとの自動連携用APIのエンドポイント設計および認証フローの実装を行います。OAuth2.0のトークン更新処理を含むバックエンドの修正が主な作業となります。",
        status: "pending",
      },
      {
        date: 25,
        fullDate: "2026/03/25",
        dayShort: "(水)",
        workType: "在宅勤務",
        description: "ダッシュボードUIのデザイン改修。ユーザーフィードバックに基づき、管理者画面のデータ可視化コンポーネントのレイアウト調整とカラーパレットの最適化を実施します。",
        status: "pending",
      },
      {
        date: 27,
        fullDate: "2026/03/27",
        dayShort: "(金)",
        workType: "在宅勤務",
        description: "週次デプロイ準備とドキュメント作成。来週のリリースに向けたコードレビューの修正対応および、APIドキュメントの更新作業。",
        status: "pending",
      },
    ],
  },
  {
    id: "2",
    employeeName: "田中 舞",
    department: "UI/UXデザイン",
    departmentId: "design",
    avatarInitials: "田",
    weekLabel: "第13週",
    weekRange: "2026/03/22 - 03/28",
    status: "pending",
    days: [
      {
        date: 24,
        fullDate: "2026/03/24",
        dayShort: "(火)",
        workType: "在宅勤務",
        description: "新機能のプロトタイプ作成とFigmaデザインの更新。",
        status: "pending",
      },
      {
        date: 26,
        fullDate: "2026/03/26",
        dayShort: "(木)",
        workType: "在宅勤務",
        description: "ユーザーリサーチ結果の整理と次回スプリントへの反映。",
        status: "pending",
      },
    ],
  },
  {
    id: "3",
    employeeName: "高橋 浩二",
    department: "システムエンジニア",
    departmentId: "sys",
    avatarInitials: "高",
    weekLabel: "第13週",
    weekRange: "2026/03/22 - 03/28",
    status: "pending",
    days: [
      {
        date: 23,
        fullDate: "2026/03/23",
        dayShort: "(月)",
        workType: "在宅勤務",
        description: "サーバーインフラの監視ダッシュボード更新と障害対応手順の文書化。",
        status: "pending",
      },
      {
        date: 24,
        fullDate: "2026/03/24",
        dayShort: "(火)",
        workType: "在宅勤務",
        description: "セキュリティパッチ適用とバックアップ設定の見直し。",
        status: "pending",
      },
      {
        date: 25,
        fullDate: "2026/03/25",
        dayShort: "(水)",
        workType: "在宅勤務",
        description: "CI/CDパイプラインの最適化とデプロイ自動化の改善。",
        status: "pending",
      },
    ],
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function ApprovePage() {
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all")
  const [selectedRequestId, setSelectedRequestId] = useState<string>("1")
  const [approverComment, setApproverComment] = useState("")

  const filteredRequests = useMemo(() => {
    if (selectedDepartment === "all") return mockRequests
    return mockRequests.filter((r) => r.departmentId === selectedDepartment)
  }, [selectedDepartment])

  const selectedRequest = filteredRequests.find((r) => r.id === selectedRequestId)
    ?? filteredRequests[0]

  const pendingCount = mockRequests.filter((r) => r.status === "pending").length

  return (
    <DashboardLayout>
      <div className="flex flex-1">
        {/* ── Left Panel ── */}
        <div className="flex-1 p-8">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                チーム承認ポータル
              </h1>
              <p className="text-slate-600">
                現在{" "}
                <span className="font-semibold text-slate-900">{pendingCount}件</span>
                の保留中リクエストがあります
              </p>
            </div>
            <div className="flex items-center gap-6">
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="h-9 px-4 bg-grey-200 w-72 hover:bg-grey-300 text-slate-900 font-medium text-sm border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 rounded-sm"
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id} className="bg-slate-50 text-slate-900">
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pending List Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              承認待ちリスト
            </h2>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
              {filteredRequests.length} PENDING
            </span>
          </div>

          {/* Employee Request Cards */}
          <div className="space-y-3">
            {filteredRequests.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                この部署には保留中のリクエストはありません
              </div>
            ) : (
              filteredRequests.map((req) => (
                <Card
                  key={req.id}
                  onClick={() => setSelectedRequestId(req.id)}
                  className={`p-4 cursor-pointer transition-all hover:shadow-md ${
                    selectedRequest?.id === req.id
                      ? "border-blue-400 border-2 bg-blue-50"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center text-sm font-bold text-amber-800 flex-shrink-0">
                        {req.avatarInitials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{req.employeeName}</p>
                        <p className="text-xs text-slate-500">{req.department}</p>
                      </div>
                    </div>
                    <StatusBadge status={req.status} />
                  </div>

                  {/* Week info */}
                  <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
                    <span>📅</span>
                    <span>{req.weekLabel} {req.weekRange}</span>
                  </div>

                  {/* Day badges */}
                  <div className="flex gap-2 flex-wrap">
                    {req.days.map((day) => (
                      <span
                        key={day.date}
                        className="inline-flex items-center px-2.5 py-1 rounded-sm text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        {day.date}{day.dayShort}
                      </span>
                    ))}
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="w-5/12 p-8 bg-white border-l border-slate-200 overflow-y-auto">
          {selectedRequest ? (
            <>
              {/* Employee Header */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-amber-200 flex items-center justify-center text-base font-bold text-amber-800 flex-shrink-0">
                      {selectedRequest.avatarInitials}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {selectedRequest.employeeName}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {selectedRequest.department} ・ {selectedRequest.weekRange} 申請分
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-slate-400">申請ステータス</span>
                    <StatusBadge status={selectedRequest.status} />
                  </div>
                </div>
              </div>

              {/* Day Entries */}
              <div className="space-y-3 mb-6">
                {selectedRequest.days.map((day) => (
                  <Card key={day.date} className="p-4 border border-slate-200">
                    <div className="flex items-start gap-4">
                      {/* Date badge */}
                      <div className="flex flex-col items-center justify-center border-slate-300 border-2 p-2 bg-blue-50 rounded-md min-w-16 h-16 flex-shrink-0">
                        <span className="text-2xl font-bold text-slate-900">{day.date}</span>
                        <span className="text-xs font-medium text-amber-900 uppercase mt-1">{day.dayShort}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                            {day.workType}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">
                          {day.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Approver Comment */}
              <div className="mb-6">
                <label className="text-sm font-medium text-slate-900 block mb-2">
                  承認者コメント
                </label>
                <textarea
                  value={approverComment}
                  onChange={(e) => setApproverComment(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  placeholder="修正が必要な点やアドバイスがあれば入力してください..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium text-lg rounded-full border border-slate-300">
                  差し戻し
                </Button>
                <Button className="flex-1 h-11 bg-slate-900 hover:bg-slate-800 text-white font-medium text-lg rounded-full">
                  承認する
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              左のリストから申請を選択してください
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
