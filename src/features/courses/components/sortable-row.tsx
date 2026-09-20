"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * FR-04.2 — รายการที่ลากเรียงลำดับได้
 *
 * ใช้ sensor ทั้งเมาส์และคีย์บอร์ด (Tab ไปที่ปุ่มจับ แล้ว Space/ลูกศร) เพื่อให้ผ่าน DoD ข้อ A11y
 * เพราะการลากด้วยเมาส์อย่างเดียวใช้กับคนที่ใช้คีย์บอร์ดหรือ screen reader ไม่ได้
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  children,
  className,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  children: (item: T, index: number) => React.ReactNode;
  className?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;

    onReorder(arrayMove(items, from, to).map((i) => i.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className={className}>{items.map((item, index) => children(item, index))}</ul>
      </SortableContext>
    </DndContext>
  );
}

/** แถวหนึ่งในรายการที่ลากได้ — ปุ่มจับอยู่ใน `handle` ที่ส่งกลับไปให้ผู้เรียกวางเอง */
export function SortableItem({
  id,
  label,
  className,
  children,
}: {
  id: string;
  /** ข้อความที่ screen reader อ่านตอนโฟกัสปุ่มจับ */
  label: string;
  className?: string;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`จับเพื่อเรียงลำดับ ${label}`}
      className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 opacity-80", className)}
    >
      {children(handle)}
    </li>
  );
}
