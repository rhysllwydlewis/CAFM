import { Module } from '@nestjs/common';
import { InvitesController } from './invites.controller';
import { PeopleController } from './people.controller';
import { PeopleImportController } from './people-import.controller';

@Module({ controllers: [InvitesController, PeopleController, PeopleImportController] })
export class PeopleModule {}
