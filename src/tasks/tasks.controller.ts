import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

// No single resource prefix — this controller spans /projects/:id/tasks and
// /tasks/* (see PLANNING.md Phase 2), so each route declares its full path.
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @ResponseMessage('Tasks fetched successfully')
  @RequirePermission(Permission.TASK_VIEW)
  @Get('projects/:projectId/tasks')
  findAllForProject(
    @Req() req: Request & { user: RequestUser },
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return this.tasksService.findAllForProject(req.user.id, projectId);
  }

  @ResponseMessage('Task created successfully')
  @RequirePermission(Permission.TASK_CREATE)
  @Post('projects/:projectId/tasks')
  create(
    @Req() req: Request & { user: RequestUser },
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(req.user.id, projectId, dto);
  }

  // Must come before ':id' below, or "me" would be parsed as a task id.
  @ResponseMessage('Your tasks fetched successfully')
  @RequirePermission(Permission.TASK_VIEW)
  @Get('tasks/me')
  findMine(@Req() req: Request & { user: RequestUser }) {
    return this.tasksService.findMine(req.user.id);
  }

  // Must also come before ':id' below — same reason as 'me': a literal
  // path segment has to be matched before the generic :id/ParseIntPipe
  // route would otherwise try (and fail) to parse "by-code" as a number.
  @ResponseMessage('Task fetched successfully')
  @RequirePermission(Permission.TASK_VIEW)
  @Get('tasks/by-code/:code')
  findByCode(
    @Req() req: Request & { user: RequestUser },
    @Param('code') code: string,
  ) {
    return this.tasksService.findByCode(req.user.id, code);
  }

  @ResponseMessage('Task fetched successfully')
  @RequirePermission(Permission.TASK_VIEW)
  @Get('tasks/:id')
  findOne(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tasksService.findOne(req.user.id, id);
  }

  // TASK_ASSIGN is checked separately, inside the service, only when the
  // request actually changes assigneeId — this route's DTO covers many
  // optional fields (title/description/status/priority/dueDate/assigneeId)
  // and MEMBER (who has TASK_UPDATE but not TASK_ASSIGN) must still be able
  // to edit a task's ordinary fields without touching its assignee.
  @ResponseMessage('Task updated successfully')
  @RequirePermission(Permission.TASK_UPDATE)
  @Patch('tasks/:id')
  update(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(req.user.id, id, dto);
  }

  @ResponseMessage('Task deleted successfully')
  @RequirePermission(Permission.TASK_DELETE)
  @HttpCode(HttpStatus.OK)
  @Delete('tasks/:id')
  remove(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tasksService.remove(req.user.id, id);
  }

  @ResponseMessage('Subtask added successfully')
  @RequirePermission(Permission.TASK_UPDATE)
  @Post('tasks/:id/subtasks')
  addSubtask(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSubtaskDto,
  ) {
    return this.tasksService.addSubtask(req.user.id, id, dto);
  }

  @ResponseMessage('Subtask updated successfully')
  @RequirePermission(Permission.TASK_UPDATE)
  @Patch('tasks/:id/subtasks/:subtaskId')
  updateSubtask(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('subtaskId', ParseIntPipe) subtaskId: number,
    @Body() dto: UpdateSubtaskDto,
  ) {
    return this.tasksService.updateSubtask(req.user.id, id, subtaskId, dto);
  }

  @ResponseMessage('Subtask removed successfully')
  @RequirePermission(Permission.TASK_UPDATE)
  @HttpCode(HttpStatus.OK)
  @Delete('tasks/:id/subtasks/:subtaskId')
  removeSubtask(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('subtaskId', ParseIntPipe) subtaskId: number,
  ) {
    return this.tasksService.removeSubtask(req.user.id, id, subtaskId);
  }

  @ResponseMessage('Comments fetched successfully')
  @RequirePermission(Permission.TASK_VIEW)
  @Get('tasks/:id/comments')
  listComments(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tasksService.listComments(req.user.id, id);
  }

  @ResponseMessage('Comment added successfully')
  @RequirePermission(Permission.TASK_COMMENT)
  @Post('tasks/:id/comments')
  addComment(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCommentDto,
  ) {
    return this.tasksService.addComment(req.user.id, id, dto);
  }
}
