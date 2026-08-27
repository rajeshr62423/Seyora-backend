import { ArrayMinSize, IsArray, IsString, IsUrl } from 'class-validator';

export class CreateWebhookDto {
  // require_protocol so a bare string like "not-a-url" is rejected;
  // require_tld: false so local test endpoints (http://localhost:5000/hook)
  // still validate.
  @IsUrl({ require_tld: false, require_protocol: true })
  url: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  events: string[];
}
