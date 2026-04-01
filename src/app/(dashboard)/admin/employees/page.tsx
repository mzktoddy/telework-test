"use client"

import React, { useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { Button, Card, Input } from "@/components/ui"

interface Employee {
  id: string
  name: string
  email: string
  department: string
  role: string
  status: "active" | "inactive"
  joinDate: string
}

const mockEmployees: Employee[] = [
  {
    id: "1",
    name: "田中 太郎",
    email: "tanaka@example.com",
    department: "編集部",
    role: "employee",
    status: "active",
    joinDate: "2023-01-15",
  },
  {
    id: "2",
    name: "佐藤 次郎",
    email: "sato@example.com",
    department: "営業部",
    role: "manager",
    status: "active",
    joinDate: "2022-06-01",
  },
  {
    id: "3",
    name: "鈴木 花子",
    email: "suzuki@example.com",
    department: "企画部",
    role: "employee",
    status: "active",
    joinDate: "2023-03-20",
  },
  {
    id: "4",
    name: "高橋 美咲",
    email: "takahashi@example.com",
    department: "編集部",
    role: "employee",
    status: "inactive",
    joinDate: "2021-11-10",
  },
]

export default function EmployeesPage() {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredEmployees = mockEmployees.filter(
    (emp) =>
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Employees</h1>
          <p className="text-slate-600">Manage employee accounts and permissions</p>
        </div>

        {/* Toolbar */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex-1 max-w-md">
            <Input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            + Add Employee
          </Button>
        </div>

        {/* Employees Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                    Join Date
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {employee.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {employee.email}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {employee.department}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {employee.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          employee.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {employee.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(employee.joinDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm">
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Empty State */}
        {filteredEmployees.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-600 mb-4">No employees found</p>
            <Button variant="outline">Clear search</Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
