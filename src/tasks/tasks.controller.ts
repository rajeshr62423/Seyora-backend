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
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @ResponseMessage('Tasks fetched successfully')
  @Get('projects/:projectId/tasks')
  findAllForProject(
    @Req() req: Request & { user: RequestUser },
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return this.tasksService.findAllForProject(req.user.id, projectId);
  }

  @ResponseMessage('Task created successfully')
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
  @Get('tasks/me')
  findMine(@Req() req: Request & { user: RequestUser }) {
    return this.tasksService.findMine(req.user.id);
  }

  @ResponseMessage('Task fetched successfully')
  @Get('tasks/:id')
  findOne(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tasksService.findOne(req.user.id, id);
  }

  @ResponseMessage('Task updated successfully')
  @Patch('tasks/:id')
  update(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(req.user.id, id, dto);
  }

  @ResponseMessage('Subtask added successfully')
  @Post('tasks/:id/subtasks')
  addSubtask(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSubtaskDto,
  ) {
    return this.tasksService.addSubtask(req.user.id, id, dto);
  }

  @ResponseMessage('Subtask updated successfully')
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
  @Get('tasks/:id/comments')
  listComments(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tasksService.listComments(req.user.id, id);
  }

  @ResponseMessage('Comment added successfully')
  @Post('tasks/:id/comments')
  addComment(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCommentDto,
  ) {
    return this.tasksService.addComment(req.user.id, id, dto);
  }
}
