import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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
import { CreateProjectDto } from './dto/create-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @ResponseMessage('Projects fetched successfully')
  @RequirePermission(Permission.PROJECT_VIEW)
  @Get()
  findAll(
    @Req() req: Request & { user: RequestUser },
    @Query() query: QueryProjectsDto,
  ) {
    return this.projectsService.findAll(req.user.id, query);
  }

  @ResponseMessage('Project created successfully')
  @RequirePermission(Permission.PROJECT_CREATE)
  @Post()
  create(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(req.user.id, dto);
  }

  @ResponseMessage('Project fetched successfully')
  @RequirePermission(Permission.PROJECT_VIEW)
  @Get(':slug')
  findOne(
    @Req() req: Request & { user: RequestUser },
    @Param('slug') slug: string,
  ) {
    return this.projectsService.findBySlug(req.user.id, slug);
  }

  @ResponseMessage('Project updated successfully')
  @RequirePermission(Permission.PROJECT_UPDATE)
  @Patch(':id')
  update(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(req.user.id, id, dto);
  }
}
