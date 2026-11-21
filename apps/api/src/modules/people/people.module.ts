import { Module } from '@nestjs/common';
import { InvitesController } from './invites.controller';
import { PeopleController } from './people.controller';

@Module({ controllers: [InvitesController, PeopleController] })
export class PeopleModule {}
